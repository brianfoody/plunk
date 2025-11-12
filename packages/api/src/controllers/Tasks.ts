import { Controller, Post } from "@overnightjs/core";
import type { Request, Response } from "express";
import signale from "signale";
import { prisma } from "../database/prisma";
import { ContactService } from "../services/ContactService";
import { EmailService } from "../services/EmailService";
import { ProjectService } from "../services/ProjectService";
import { type Task, type Action, type Campaign, type Contact, type Template, type Event, TaskStatus, CampaignStatus } from "@prisma/client";
import { MAX_EMAILS_PER_SECOND, MAX_EMAILS_PER_MINUTE } from "../app/constants";
import { redis } from "../services/redis";

type TaskWithRelations = Task & {
	action: (Action & { template: Template; notevents: Event[] }) | null;
	campaign: Campaign | null;
	contact: Contact;
};

@Controller("tasks")
export class Tasks {
	private static readonly EMAILS_PER_MINUTE = MAX_EMAILS_PER_MINUTE;
	private static readonly MINUTE_KEY_PREFIX = "email:rate:minute";
	private static readonly SECOND_KEY_PREFIX = "email:rate:second";

	private static getMinuteKey(): string {
		const now = new Date();
		const minute = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
		return `${Tasks.MINUTE_KEY_PREFIX}:${minute}`;
	}

	private static getSecondKey(): string {
		const now = new Date();
		const second = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
		return `${Tasks.SECOND_KEY_PREFIX}:${second}`;
	}

	private static async getCurrentMinuteCount(): Promise<number> {
		try {
			const key = Tasks.getMinuteKey();
			const count = await redis.get(key);
			return count ? parseInt(count, 10) : 0;
		} catch (error) {
			signale.error("Failed to get minute count from Redis:", error);
			return 0;
		}
	}

	private static async getCurrentSecondCount(): Promise<number> {
		try {
			const key = Tasks.getSecondKey();
			const count = await redis.get(key);
			return count ? parseInt(count, 10) : 0;
		} catch (error) {
			signale.error("Failed to get second count from Redis:", error);
			return 0;
		}
	}

	private static async canSendEmail(): Promise<boolean> {
		try {
			const minuteKey = Tasks.getMinuteKey();
			const secondKey = Tasks.getSecondKey();

			// Check minute limit
			const minuteCount = await Tasks.getCurrentMinuteCount();
			if (minuteCount >= Tasks.EMAILS_PER_MINUTE) {
				return false;
			}

			// Check second limit
			const secondCount = await Tasks.getCurrentSecondCount();
			if (secondCount >= MAX_EMAILS_PER_SECOND) {
				return false;
			}

			// Increment both counters
			const pipeline = redis.pipeline();
			pipeline.incr(minuteKey);
			pipeline.expire(minuteKey, 3600); // Expire after 1 hour
			pipeline.incr(secondKey);
			pipeline.expire(secondKey, 2); // Expire after 2 seconds

			await pipeline.exec();

			return true;
		} catch (error) {
			signale.error("Failed to check rate limits:", error);
			return false;
		}
	}

	@Post()
	public async handleTasks(req: Request, res: Response) {
		const MAX_PER_MINUTE = Tasks.EMAILS_PER_MINUTE;

		const tasks = await prisma.task.findMany({
			where: { status: TaskStatus.PENDING },
			orderBy: { createdAt: "asc" },
			include: {
				action: { include: { template: true, notevents: true } },
				campaign: true,
				contact: true,
			},
			take: MAX_EMAILS_PER_MINUTE,
		});

		if (tasks.length === 0) {
			return res.status(200).json({ success: true, processed: 0 });
		}

		let processed = 0;
		const completedCampaignIds = new Set<string>();

		for (const task of tasks) {
			const minuteCount = await Tasks.getCurrentMinuteCount();
			if (minuteCount >= MAX_PER_MINUTE) {
				signale.info(`Minute limit reached after ${processed} emails`);
				return res.status(200).json({
					success: true,
					processed: processed,
					timestamp: new Date().toISOString(),
				});
			}

			let canSend = false;
			let retries = 0;
			const MAX_RETRIES = 3;

			while (!canSend && retries < MAX_RETRIES) {
				const minuteCount = await Tasks.getCurrentMinuteCount();
				if (minuteCount >= MAX_PER_MINUTE) {
					signale.info(`Minute limit reached after ${processed} emails`);
					return res.status(200).json({
						success: true,
						processed: processed,
						timestamp: new Date().toISOString(),
					});
				}

				const secondCount = await Tasks.getCurrentSecondCount();
				if (secondCount >= MAX_EMAILS_PER_SECOND) {
					signale.info(`Per-second limit reached, waiting for 1 second...`);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					continue;
				}

				canSend = await Tasks.canSendEmail();
				if (canSend) {
					break;
				}

				retries++;
				if (retries < MAX_RETRIES) {
					const baseDelay = 50 + Math.random() * 100;
					const delay = baseDelay * Math.pow(2, retries - 1);
					signale.info(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${retries}/${MAX_RETRIES})...`);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}

			if (!canSend) {
				signale.warn(`Failed to reserve slot for task ${task.id} after ${MAX_RETRIES} retries, skipping`);
				continue;
			}

			try {
				const wasCompleted = await this.processSingleTask(task);
				if (wasCompleted && task.campaignId) {
					completedCampaignIds.add(task.campaignId);
				}
				processed++;
			} catch (error) {
				signale.error(`Failed to process task ${task.id}:`, error);
			}
		}

		await this.checkAndMarkCampaignsFinished(completedCampaignIds);

		signale.info(`Processed ${processed} tasks`);
		return res.status(200).json({
			success: true,
			processed: processed,
			timestamp: new Date().toISOString(),
		});
	}

	private async processSingleTask(task: TaskWithRelations): Promise<boolean> {
		try {
			await prisma.task.update({
				where: { id: task.id },
				data: { status: TaskStatus.PROCESSING },
			});

			await this.processTask(task);

			await prisma.task.update({
				where: { id: task.id },
				data: { status: TaskStatus.COMPLETED },
			});
			signale.success(`Email sent to ${task.contact.email}`);
			return true;
		} catch (error) {
			signale.error(`Failed to process task ${task.id}:`, error);
			// TODO: Implement retry/backoff if necessary
			await prisma.task.update({
				where: { id: task.id },
				data: {
					status: TaskStatus.FAILED,
				},
			});
			return false;
		}
	}

	private async checkAndMarkCampaignsFinished(campaignIds: Set<string>): Promise<void> {
		for (const campaignId of campaignIds) {
			const campaign = await prisma.campaign.findUnique({
				where: { id: campaignId },
				select: { status: true },
			});

			if (!campaign || campaign.status === CampaignStatus.DELIVERED) {
				continue;
			}

			const pendingTasks = await prisma.task.count({
				where: {
					campaignId,
					status: {
						in: [TaskStatus.PENDING, TaskStatus.PROCESSING],
					},
				},
			});

			if (pendingTasks === 0) {
				await prisma.campaign.update({
					where: { id: campaignId },
					data: {
						status: CampaignStatus.DELIVERED,
						delivered: new Date(),
					},
				});
				signale.info(`Campaign ${campaignId} marked as DELIVERED - all tasks completed`);
			}
		}
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
