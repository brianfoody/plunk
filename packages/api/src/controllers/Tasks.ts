import { Controller, Post } from "@overnightjs/core";
import type { Request, Response } from "express";
import signale from "signale";
import { prisma } from "../database/prisma";
import { ContactService } from "../services/ContactService";
import { EmailService } from "../services/EmailService";
import { ProjectService } from "../services/ProjectService";
import { type Task, type Action, type Campaign, type Contact, type Template, type Event, TaskStatus } from "@prisma/client";
import { MAX_EMAILS_PER_SECOND, MAX_EMAILS_PER_DAY } from "../app/constants";
import { redis } from "../services/redis";

type TaskWithRelations = Task & {
	action: (Action & { template: Template; notevents: Event[] }) | null;
	campaign: Campaign | null;
	contact: Contact;
};

@Controller("tasks")
export class Tasks {
	private static getDailyKey(): string {
		const today = new Date().toISOString().split("T")[0];
		return `email:rate:daily:${today}`;
	}

	private static getRecentKey(): string {
		return "email:rate:recent";
	}

	private static async getDailyCount(): Promise<number> {
		const key = Tasks.getDailyKey();
		const count = await redis.get(key);
		return count ? parseInt(count, 10) : 0;
	}

	private static async getRecentCount(): Promise<number> {
		const key = Tasks.getRecentKey();
		const oneSecondAgo = Date.now() - 1000;
		const count = await redis.zcount(key, oneSecondAgo, Date.now());
		return count;
	}

	private static async canSendEmail(): Promise<boolean> {
		const dailyCount = await Tasks.getDailyCount();
		const recentCount = await Tasks.getRecentCount();

		if (dailyCount >= MAX_EMAILS_PER_DAY) {
			return false;
		}

		if (recentCount >= MAX_EMAILS_PER_SECOND) {
			return false;
		}

		return true;
	}

	private static async recordEmailSent(): Promise<void> {
		const now = Date.now();
		const recentKey = Tasks.getRecentKey();
		const dailyKey = Tasks.getDailyKey();

		await redis.zadd(recentKey, now, now.toString());
		await redis.expire(recentKey, 2);

		const dailyCount = await redis.incr(dailyKey);
		if (dailyCount === 1) {
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);
			const secondsUntilMidnight = Math.floor((tomorrow.getTime() - Date.now()) / 1000);
			await redis.expire(dailyKey, secondsUntilMidnight);
		}

		const oneSecondAgo = now - 1000;
		await redis.zremrangebyscore(recentKey, 0, oneSecondAgo);
	}

	@Post()
	public async handleTasks(req: Request, res: Response) {
		const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || "20");
		const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL_EMAILS || "5");

		const canSend = await Tasks.canSendEmail();
		if (!canSend) {
			const dailyCount = await Tasks.getDailyCount();
			const recentCount = await Tasks.getRecentCount();
			signale.warn(
				`Rate limit reached. Daily: ${dailyCount}/${MAX_EMAILS_PER_DAY}, Per second: ${recentCount}/${MAX_EMAILS_PER_SECOND}`,
			);
			return res.status(200).json({ success: true, processed: 0, rateLimited: true });
		}

		const dailyCount = await Tasks.getDailyCount();
		const recentCount = await Tasks.getRecentCount();

		const availableSlots = Math.min(BATCH_SIZE, MAX_EMAILS_PER_SECOND - recentCount, MAX_EMAILS_PER_DAY - dailyCount);

		if (availableSlots <= 0) {
			return res.status(200).json({ success: true, processed: 0, rateLimited: true });
		}

		const tasks = await prisma.task.findMany({
			where: { runBy: { lte: new Date() }, status: TaskStatus.PENDING },
			orderBy: { runBy: "asc" },
			take: availableSlots,
			include: {
				action: { include: { template: true, notevents: true } },
				campaign: true,
				contact: true,
			},
		});

		if (tasks.length === 0) {
			return res.status(200).json({ success: true, processed: 0 });
		}

		const processPromises: Promise<void>[] = [];

		for (let i = 0; i < tasks.length; i += MAX_PARALLEL) {
			const batch = tasks.slice(i, i + MAX_PARALLEL);
			processPromises.push(this.processBatch(batch));
		}

		await Promise.allSettled(processPromises);

		signale.info(`Processed ${tasks.length} tasks`);

		return res.status(200).json({
			success: true,
			processed: tasks.length,
			timestamp: new Date().toISOString(),
		});
	}

	private async processBatch(tasks: TaskWithRelations[]): Promise<void> {
		const emailPromises = tasks.map(async (task) => {
			try {
				await prisma.task.update({
					where: { id: task.id },
					data: {
						status: TaskStatus.PROCESSING,
					},
				});
				await this.processTask(task);
				await prisma.task.update({
					where: { id: task.id },
					data: {
						status: TaskStatus.COMPLETED,
					},
				});
				signale.success(`Email sent to ${task.contact.email}`);
			} catch (error) {
				signale.error(`Failed to process task ${task.id}:`, error);
				// TODO: Implement retry/backoff if necessary
				await prisma.task.update({
					where: { id: task.id },
					data: {
						status: TaskStatus.FAILED,
					},
				});
			}
		});

		await Promise.allSettled(emailPromises);
	}

	private async processTask(task: TaskWithRelations): Promise<void> {
		const { action, campaign, contact } = task;

		const project = await ProjectService.id(contact.projectId);

		if (!project) {
			await prisma.task.deleteMany({
				where: {
					contact: {
						projectId: contact.projectId,
					},
				},
			});
			return;
		}

		let subject = "";
		let body = "";
		let email = "";
		let name = "";

		if (action) {
			const { template, notevents } = action;

			if (notevents.length > 0) {
				const triggers = await ContactService.triggers(contact.id);
				if (notevents.some((e) => triggers.some((t) => t.contactId === contact.id && t.eventId === e.id))) {
					return;
				}
			}

			email = project.verified && project.email ? template.email ?? project.email : "no-reply@useplunk.dev";
			name = template.from ?? project.from ?? project.name;

			({ subject, body } = EmailService.format({
				subject: template.subject,
				body: template.body,
				data: {
					plunk_id: contact.id,
					plunk_email: contact.email,
					...JSON.parse(contact.data ?? "{}"),
				},
			}));
		} else if (campaign) {
			email = project.verified && project.email ? campaign.email ?? project.email : "no-reply@useplunk.dev";
			name = campaign.from ?? project.from ?? project.name;

			({ subject, body } = EmailService.format({
				subject: campaign.subject,
				body: campaign.body,
				data: {
					plunk_id: contact.id,
					plunk_email: contact.email,
					...JSON.parse(contact.data ?? "{}"),
				},
			}));
		}

		const { messageId } = await EmailService.send({
			from: {
				name,
				email,
			},
			to: [contact.email],
			content: {
				subject,
				html: EmailService.compile({
					content: body,
					footer: {
						unsubscribe: campaign ? true : !!action && action.template.type === "MARKETING",
					},
					contact: {
						id: contact.id,
					},
					project: {
						name: project.name,
					},
					isHtml: (campaign && campaign.style === "HTML") ?? (!!action && action.template.style === "HTML"),
				}),
			},
		});

		await Tasks.recordEmailSent();

		const emailData: {
			messageId: string;
			contactId: string;
			actionId?: string;
			campaignId?: string;
		} = {
			messageId,
			contactId: contact.id,
		};

		if (action) {
			emailData.actionId = action.id;
		} else if (campaign) {
			emailData.campaignId = campaign.id;
		}

		await prisma.email.create({ data: emailData });
	}
}
