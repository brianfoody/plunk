import useSWR from "swr";
import { Campaign } from "@prisma/client";
import { useActiveProject } from "./projects";

/**
 *
 * @param id
 */
export function useCampaign(id: string) {
	return useSWR(`/v1/campaigns/${id}`);
}

/**
 * Hook for paginated campaign emails with search functionality
 * @param campaignId
 * @param page
 * @param limit
 * @param search
 */
export function usePaginatedCampaignEmails(campaignId: string, page: number = 1, limit: number = 20, search?: string) {
	const queryParams = new URLSearchParams({
		page: page.toString(),
		limit: limit.toString(),
		...(search && { search }),
	});

	return useSWR<{
		emails: {
			id: string;
			status: string;
			contact: { id: string; email: string };
		}[];
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	}>(campaignId ? `/v1/campaigns/${campaignId}/emails/paginated?${queryParams}` : null, {
		revalidateOnFocus: false,
		refreshInterval: 0,
	});
}

/**
 *
 */
export function useCampaigns() {
	const activeProject = useActiveProject();

	return useSWR<
		(Campaign & {
			emails: {
				id: string;
				status: string;
			}[];
			tasks: {
				id: string;
			}[];
			recipients: {
				id: string;
			}[];
		})[]
	>(activeProject ? `/projects/id/${activeProject.id}/campaigns` : null);
}
