import { Keys } from "./keys";
import { wrapRedis } from "./redis";
import { prisma } from "../database/prisma";
import { TaskStatus } from "@prisma/client";

export class CampaignService {
	public static id(id: string) {
		return wrapRedis(Keys.Campaign.id(id), async () => {
			return prisma.campaign.findUnique({
				where: { id },
				include: {
					recipients: { select: { id: true } },
					emails: { select: { id: true, status: true, contact: { select: { id: true, email: true } } } },
				},
			});
		});
	}

	public static async getPaginatedEmails(campaignId: string, page: number = 1, limit: number = 20, search?: string) {
		const where: any = {
			campaignId,
			...(search && {
				contact: {
					OR: [{ email: { contains: search, mode: "insensitive" } }, { data: { contains: search, mode: "insensitive" } }],
				},
			}),
		};

		const [emails, total] = await Promise.all([
			prisma.email.findMany({
				where,
				select: {
					id: true,
					status: true,
					contact: { select: { id: true, email: true } },
				},
				orderBy: [{ createdAt: "desc" }],
				take: limit,
				skip: (page - 1) * limit,
			}),
			prisma.email.count({ where }),
		]);

		return {
			emails,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	public static async getStats(campaignId: string) {
		const campaign = await prisma.campaign.findUnique({
			where: { id: campaignId },
			select: {
				recipients: { select: { id: true } },
			},
		});

		if (!campaign) {
			return null;
		}

		const [pendingCount, processingCount, completedCount, failedCount] = await Promise.all([
			prisma.task.count({
				where: { campaignId, status: TaskStatus.PENDING },
			}),
			prisma.task.count({
				where: { campaignId, status: TaskStatus.PROCESSING },
			}),
			prisma.task.count({
				where: { campaignId, status: TaskStatus.COMPLETED },
			}),
			prisma.task.count({
				where: { campaignId, status: TaskStatus.FAILED },
			}),
		]);

		const EMAIL_BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || "20");
		const emailsPerMinute = EMAIL_BATCH_SIZE;

		return {
			totalRecipients: campaign.recipients.length,
			pendingTasks: pendingCount,
			processingTasks: processingCount,
			completedTasks: completedCount,
			failedTasks: failedCount,
			emailsPerMinute,
		};
	}
}
