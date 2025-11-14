import { SES } from "@aws-sdk/client-ses";
import { promises as fs } from "fs";
import { join } from "path";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, IS_SES_CONFIGURED } from "../app/constants";

class MockSES {
	private emailsFile: string;

	constructor() {
		this.emailsFile = join(process.cwd(), "emails.jsonl");
	}

	private async writeEmail(data: {
		timestamp: string;
		from: { name: string; email: string };
		to: string[];
		subject: string;
		html: string;
		rawMessage: string;
	}) {
		const line = JSON.stringify(data) + "\n";
		await fs.appendFile(this.emailsFile, line, "utf-8");
	}

	private parseRawMessage(rawMessage: string): {
		from: { name: string; email: string };
		to: string[];
		subject: string;
		html: string;
	} {
		const lines = rawMessage.split("\n");
		let from = { name: "", email: "" };
		let to: string[] = [];
		let subject = "";
		let html = "";

		let inHtmlPart = false;
		let htmlLines: string[] = [];
		let currentBoundary = "";

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (line.startsWith("From:")) {
				const match = line.match(/From:\s*(.+?)\s*<(.+?)>|From:\s*(.+)/);
				if (match) {
					if (match[1] && match[2]) {
						from = { name: match[1].trim(), email: match[2].trim() };
					} else if (match[3]) {
						from = { name: "", email: match[3].trim() };
					}
				}
			} else if (line.startsWith("To:")) {
				const toPart = line.replace(/^To:\s*/, "");
				to = toPart.split(",").map((e) => e.trim());
			} else if (line.startsWith("Subject:")) {
				subject = line.replace(/^Subject:\s*/, "").trim();
			} else if (line.includes("Content-Type:") && line.includes("boundary")) {
				const boundaryMatch = line.match(/boundary="(.+?)"|boundary=([^\s;]+)/);
				if (boundaryMatch) {
					currentBoundary = boundaryMatch[1] || boundaryMatch[2];
				}
			} else if (line.includes("Content-Type: text/html")) {
				inHtmlPart = true;
			} else if (inHtmlPart) {
				if (line.trim() === "" && htmlLines.length === 0) {
					continue;
				}
				if (
					currentBoundary &&
					(line.startsWith(`--${currentBoundary}`) || line.startsWith(`--${currentBoundary.replace(/^--/, "")}`))
				) {
					break;
				}
				if (!currentBoundary && line.startsWith("--")) {
					break;
				}
				htmlLines.push(line);
			}
		}

		html = htmlLines.join("\n").trim();

		return { from, to, subject, html };
	}

	async sendRawEmail(params: {
		Destinations: string[];
		ConfigurationSetName?: string;
		RawMessage: { Data: Uint8Array };
		Source: string;
	}) {
		const rawMessage = new TextDecoder().decode(params.RawMessage.Data);
		const parsed = this.parseRawMessage(rawMessage);

		const emailData = {
			timestamp: new Date().toISOString(),
			from: parsed.from,
			to: params.Destinations,
			subject: parsed.subject,
			html: parsed.html,
			rawMessage: rawMessage,
		};

		await this.writeEmail(emailData);

		return {
			MessageId: `mock-${Date.now()}-${Math.random().toString(36).substring(2)}`,
		};
	}

	async getIdentityVerificationAttributes(params: { Identities: string[] }) {
		const result: Record<string, { VerificationStatus: string }> = {};
		for (const identity of params.Identities) {
			result[identity] = { VerificationStatus: "Success" };
		}
		return { VerificationAttributes: result };
	}

	async verifyDomainDkim(params: { Domain: string }) {
		return {
			DkimTokens: [`mock-token-1.${params.Domain}`, `mock-token-2.${params.Domain}`, `mock-token-3.${params.Domain}`],
		};
	}

	async setIdentityMailFromDomain(_params: { Identity: string; MailFromDomain: string }) {
		return {};
	}

	async setIdentityFeedbackForwardingEnabled(_params: { Identity: string; ForwardingEnabled: boolean }) {
		return {};
	}

	async getIdentityDkimAttributes(params: { Identities: string[] }) {
		const result: Record<string, { DkimTokens: string[]; DkimVerificationStatus: string }> = {};
		for (const identity of params.Identities) {
			result[identity] = {
				DkimTokens: [`mock-token-1.${identity}`, `mock-token-2.${identity}`, `mock-token-3.${identity}`],
				DkimVerificationStatus: "Success",
			};
		}
		return { DkimAttributes: result };
	}
}

export const ses = IS_SES_CONFIGURED
	? new SES({
			apiVersion: "2010-12-01",
			region: AWS_REGION,
			credentials: {
				accessKeyId: AWS_ACCESS_KEY_ID,
				secretAccessKey: AWS_SECRET_ACCESS_KEY,
			},
	  })
	: new MockSES();

export const getIdentities = async (identities: string[]) => {
	const res = await ses.getIdentityVerificationAttributes({
		Identities: identities.flatMap((identity) => [identity.split("@")[1]]),
	});

	const parsedResult = Object.entries(res.VerificationAttributes ?? {});
	return parsedResult.map((obj) => {
		return { email: obj[0], status: obj[1].VerificationStatus };
	});
};

export const verifyIdentity = async (email: string) => {
	const DKIM = await ses.verifyDomainDkim({
		Domain: email.includes("@") ? email.split("@")[1] : email,
	});

	await ses.setIdentityMailFromDomain({
		Identity: email.includes("@") ? email.split("@")[1] : email,
		MailFromDomain: `plunk.${email.includes("@") ? email.split("@")[1] : email}`,
	});

	return DKIM.DkimTokens;
};

export const getIdentityVerificationAttributes = async (email: string) => {
	const attributes = await ses.getIdentityDkimAttributes({
		Identities: [email, email.split("@")[1]],
	});

	const parsedAttributes = Object.entries(attributes.DkimAttributes ?? {});

	return {
		email: parsedAttributes[0][0],
		tokens: parsedAttributes[0][1].DkimTokens,
		status: parsedAttributes[0][1].DkimVerificationStatus,
	};
};
