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
	private static readonly RATE_LIMIT_SCRIPT = `
		local recentKey = KEYS[1]
		local dailyKey = KEYS[2]
		local now = tonumber(ARGV[1])
		local maxPerSecond = tonumber(ARGV[2])
		local maxPerDay = tonumber(ARGV[3])
		local secondsUntilMidnight = tonumber(ARGV[4])
		
		local dailyCount = tonumber(redis.call('GET', dailyKey) or '0')
		local oneSecondAgo = now - 1000
		local recentCount = redis.call('ZCOUNT', recentKey, oneSecondAgo, now)
		
		if dailyCount >= maxPerDay then
			return 0
		end
		
		if recentCount >= maxPerSecond then
			return 0
		end
		
		redis.call('ZADD', recentKey, now, tostring(now))
		redis.call('EXPIRE', recentKey, 2)
		
		local newDailyCount = redis.call('INCR', dailyKey)
		if newDailyCount == 1 then
			redis.call('EXPIRE', dailyKey, secondsUntilMidnight)
		end
		
		redis.call('ZREMRANGEBYSCORE', recentKey, 0, oneSecondAgo)
		
		return 1
	`;

	private static getDailyKey(): string {
		const today = new Date().toISOString().split("T")[0];
		return `email:rate:daily:${today}`;
	}

	private static getRecentKey(): string {
		return "email:rate:recent";
	}

	private static async getDailyCount(): Promise<number> {
		try {
			const key = Tasks.getDailyKey();
			const count = await redis.get(key);
			return count ? parseInt(count, 10) : 0;
		} catch (error) {
			signale.error("Failed to get daily count from Redis:", error);
			return 0;
		}
	}

	private static async getRecentCount(): Promise<number> {
		try {
			const key = Tasks.getRecentKey();
			const oneSecondAgo = Date.now() - 1000;
			const count = await redis.zcount(key, oneSecondAgo, Date.now());
			return count;
		} catch (error) {
			signale.error("Failed to get recent count from Redis:", error);
			return 0;
		}
	}

	private static async tryRecordEmailSent(): Promise<boolean> {
		try {
			const now = Date.now();
			const recentKey = Tasks.getRecentKey();
			const dailyKey = Tasks.getDailyKey();

			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);
			const secondsUntilMidnight = Math.floor((tomorrow.getTime() - Date.now()) / 1000);

			const result = await redis.eval(
				Tasks.RATE_LIMIT_SCRIPT,
				2,
				recentKey,
				dailyKey,
				now.toString(),
				MAX_EMAILS_PER_SECOND.toString(),
				MAX_EMAILS_PER_DAY.toString(),
				secondsUntilMidnight.toString(),
			);

			return result === 1;
		} catch (error) {
			signale.error("Failed to record email sent in Redis:", error);
			return false;
		}
	}

	@Post()
	public async handleTasks(req: Request, res: Response) {
		const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || "20");
		const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL_EMAILS || "5");

		const tasks = await prisma.task.findMany({
			where: { runBy: { lte: new Date() }, status: TaskStatus.PENDING },
			orderBy: { runBy: "asc" },
			take: BATCH_SIZE,
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
			await prisma.task.updateMany({
				where: {
					contact: {
						projectId: contact.projectId,
					},
					status: TaskStatus.PENDING,
				},
				data: {
					status: TaskStatus.FAILED,
				},
			});
			await prisma.task.deleteMany({
				where: {
					contact: {
						projectId: contact.projectId,
					},
				},
			});
			return;
		}

		const canSend = await Tasks.tryRecordEmailSent();
		if (!canSend) {
			const dailyCount = await Tasks.getDailyCount();
			const recentCount = await Tasks.getRecentCount();
			signale.warn(
				`Rate limit reached. Daily: ${dailyCount}/${MAX_EMAILS_PER_DAY}, Per second: ${recentCount}/${MAX_EMAILS_PER_SECOND}`,
			);
			throw new Error("Rate limit exceeded");
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
