import { useActiveProject } from "./projects";
import useSWR from "swr";
import { Email } from "@prisma/client";

/**
 *
 */
export function useEmails() {
	const activeProject = useActiveProject();

	return useSWR<Email[]>(activeProject ? `/projects/id/${activeProject.id}/emails` : null);
}

/**
 *
 */
export function useEmailsCount() {
	const activeProject = useActiveProject();

	return useSWR<number>(activeProject ? `/projects/id/${activeProject.id}/emails/count` : null);
}

/**
 * Hook for email statistics across multiple time periods
 */
export function useEmailsStats() {
	const activeProject = useActiveProject();

	return useSWR<{ last30Days: number; last7Days: number; last24Hours: number; lastHour: number }>(
		activeProject ? `/projects/id/${activeProject.id}/emails/stats` : null,
	);
}
