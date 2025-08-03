import { Keys } from "./keys";
import { wrapRedis } from "./redis";
import { prisma } from "../database/prisma";

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
}
