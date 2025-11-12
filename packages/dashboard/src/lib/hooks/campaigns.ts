import useSWR from "swr";
import { Campaign } from "@prisma/client";
import { ITEMS_PER_PAGE } from "../constants";
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
export function usePaginatedCampaignEmails(campaignId: string, page: number = 1, limit: number = ITEMS_PER_PAGE, search?: string) {
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
			_count: {
				campaignRecipients: number;
				tasks: number;
			};
		})[]
	>(activeProject ? `/projects/id/${activeProject.id}/campaigns` : null);
}

/**
 * Hook for campaign statistics
 * @param campaignId
 */
export function useCampaignStats(campaignId: string) {
	return useSWR<{
		totalRecipients: number;
		pendingTasks: number;
		processingTasks: number;
		completedTasks: number;
		failedTasks: number;
		emailsPerMinute: number;
	}>(campaignId ? `/v1/campaigns/${campaignId}/stats` : null, {
		revalidateOnFocus: true,
		refreshInterval: 5000,
	});
}

/**
 * Hook for sending rate configuration
 */
export function useSendingRate() {
	return useSWR<{ emailsPerMinute: number }>("/health/config", {
		revalidateOnFocus: false,
		refreshInterval: 0,
	});
}
