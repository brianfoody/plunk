import { Keys } from "./keys";
import { wrapRedis } from "./redis";
import { prisma } from "../database/prisma";
import { TaskStatus } from "@prisma/client";
import { DEFAULT_PAGINATION_LIMIT, MAX_EMAILS_PER_MINUTE } from "../app/constants";

export class CampaignService {
	public static id(id: string) {
		return wrapRedis(Keys.Campaign.id(id), async () => {
			return prisma.campaign.findUnique({
				where: { id },
				include: {
					_count: {
						select: {
							campaignRecipients: true,
							emails: true,
						},
					},
				},
			});
		});
	}

	public static idWithRecipients(id: string) {
		return wrapRedis(Keys.Campaign.id(id), async () => {
			return prisma.campaign.findUnique({
				where: { id },
				include: {
					_count: {
						select: {
							campaignRecipients: true,
							emails: true,
						},
					},
					campaignRecipients: { select: { contactId: true } },
				},
			});
		});
	}

	public static async getPaginatedEmails(
		campaignId: string,
		page: number = 1,
		limit: number = DEFAULT_PAGINATION_LIMIT,
		search?: string,
	) {
		if (search) {
			const matchingContactIds = await prisma.contact.findMany({
				where: {
					OR: [{ email: { contains: search, mode: "insensitive" } }, { data: { contains: search, mode: "insensitive" } }],
				},
				select: { id: true },
			});

			const contactIds = matchingContactIds.map((c) => c.id);

			if (contactIds.length === 0) {
				return {
					emails: [],
					total: 0,
					page,
					limit,
					totalPages: 0,
				};
			}

			const where = {
				campaignId,
				contactId: { in: contactIds },
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

		const where = { campaignId };

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
				_count: {
					select: {
						campaignRecipients: true,
					},
				},
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

		return {
			totalRecipients: campaign._count.campaignRecipients,
			pendingTasks: pendingCount,
			processingTasks: processingCount,
			completedTasks: completedCount,
			failedTasks: failedCount,
			emailsPerMinute: MAX_EMAILS_PER_MINUTE,
		};
	}
}
