import dayjs from "dayjs";

export function formatRelativeTime(date: string | Date | dayjs.Dayjs): string {
	const now = dayjs();
	const target = dayjs(date);
	const diff = target.diff(now, "minute");
	const isFuture = diff > 0;
	const absDiff = Math.abs(diff);

	if (absDiff < 1) {
		return isFuture ? "in less than a minute" : "less than a minute ago";
	}

	const days = Math.floor(absDiff / (24 * 60));
	const hours = Math.floor((absDiff % (24 * 60)) / 60);
	const minutes = absDiff % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
	if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
	if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);

	if (parts.length === 0) {
		return isFuture ? "in less than a minute" : "less than a minute ago";
	}

	let result = "";
	if (parts.length === 1) {
		result = parts[0];
	} else if (parts.length === 2) {
		result = `${parts[0]} and ${parts[1]}`;
	} else {
		result = `${parts[0]}, ${parts[1]} and ${parts[2]}`;
	}

	return isFuture ? `in ${result}` : `${result} ago`;
}

