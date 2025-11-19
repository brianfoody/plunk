import { CampaignStatus, PrismaClient, TemplateStyle, TemplateType } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const TOTAL_RECORDS = 1_000_000;
const BATCH_SIZE = 10_000;

const TOTAL_TEMPLATES = 200;
const TOTAL_ACTIONS = 250_000;
const ACTION_BATCH_SIZE = 10_000;
const TOTAL_EVENTS = 250_000;
const EVENT_BATCH_SIZE = 10_000;

const TOTAL_CAMPAIGNS = 100;
const MIN_CAMPAIGN_RECIPIENTS = 100_000;
const MAX_CAMPAIGN_RECIPIENTS = 999_999;
const CAMPAIGN_RECIPIENT_BATCH_SIZE = 10_000;
const CAMPAIGN_STATUSES = Object.values(CampaignStatus) as CampaignStatus[];

async function checkExistingContacts(projectId: string): Promise<number> {
	const count = await prisma.contact.count({
		where: {
			projectId: projectId,
		},
	});
	return count;
}

function generateFakeContact(projectId: string) {
	return {
		email: faker.internet.email(),
		subscribed: faker.datatype.boolean({ probability: 0.8 }),
		projectId: projectId,
		data: JSON.stringify({
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
			company: faker.company.name(),
			phone: faker.phone.number(),
			address: {
				street: faker.location.streetAddress(),
				city: faker.location.city(),
				state: faker.location.state(),
				zipCode: faker.location.zipCode(),
				country: faker.location.country(),
			},
		}),
	};
}

const TEMPLATE_TYPES = ["MARKETING", "TRANSACTIONAL"] as TemplateType[];
const TEMPLATE_STYLES = ["PLUNK", "HTML"] as TemplateStyle[];

function randomItem<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function generateFakeTemplate(projectId: string) {
	return {
		subject: faker.lorem.sentence(6),
		body: faker.lorem.paragraphs(2),
		email: faker.internet.email(),
		from: faker.internet.email(),
		type: randomItem(TEMPLATE_TYPES) as TemplateType,
		style: randomItem(TEMPLATE_STYLES) as TemplateStyle,
		projectId: projectId,
	};
}

function generateFakeAction(projectId: string, templateId: string) {
	return {
		id: faker.string.uuid(),
		name: `${faker.hacker.verb()} ${faker.hacker.noun()}`,
		runOnce: faker.datatype.boolean({ probability: 0.2 }),
		delay: faker.number.int({ min: 0, max: 86_400 }),
		projectId: projectId,
		templateId: templateId,
	};
}

async function seedContacts(projectId: string) {
	console.log(`Starting seed for project: ${projectId}`);
	console.log(`Target: ${TOTAL_RECORDS.toLocaleString()} contacts`);

	const existingCount = await checkExistingContacts(projectId);
	if (existingCount > 0) {
		throw new Error(
			`Cannot seed: ${existingCount.toLocaleString()} contacts already exist for this project. Delete existing contacts first.`,
		);
	}

	const totalBatches = Math.ceil(TOTAL_RECORDS / BATCH_SIZE);
	let totalCreated = 0;

	console.log(`Generating contacts in batches of ${BATCH_SIZE.toLocaleString()}...`);

	for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
		const batchContacts = [];
		const batchStart = (batchNum - 1) * BATCH_SIZE;
		const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_RECORDS);
		const batchSize = batchEnd - batchStart;

		for (let i = 0; i < batchSize; i++) {
			batchContacts.push(generateFakeContact(projectId));
		}

		await prisma.contact.createMany({
			data: batchContacts,
			skipDuplicates: true,
		});

		totalCreated += batchSize;
		const percentComplete = ((totalCreated / TOTAL_RECORDS) * 100).toFixed(1);
		console.log(
			`Batch ${batchNum}/${totalBatches}: Created ${totalCreated.toLocaleString()}/${TOTAL_RECORDS.toLocaleString()} (${percentComplete}%)`,
		);
	}

	console.log(`\n✅ Successfully created ${totalCreated.toLocaleString()} contacts`);
}

async function seedTemplates(projectId: string): Promise<{ id: string }[]> {
	console.log(`Seeding ${TOTAL_TEMPLATES.toLocaleString()} templates...`);

	const existingCount = await prisma.template.count({
		where: { projectId },
	});

	if (existingCount > 0) {
		throw new Error(
			`Cannot seed: ${existingCount.toLocaleString()} templates already exist for this project. Delete existing templates first.`,
		);
	}

	const templates: { id: string }[] = [];

	for (let i = 0; i < TOTAL_TEMPLATES; i++) {
		const template = await prisma.template.create({
			data: generateFakeTemplate(projectId),
		});
		templates.push({ id: template.id });
		if ((i + 1) % 50 === 0) {
			console.log(`  Created ${templates.length.toLocaleString()} templates...`);
		}
	}

	console.log(`✅ Created ${templates.length.toLocaleString()} templates`);
	return templates;
}

async function seedActions(projectId: string, templates: { id: string }[]): Promise<string[]> {
	if (!templates.length) {
		throw new Error("Cannot seed actions without templates.");
	}

	console.log(`Seeding ${TOTAL_ACTIONS.toLocaleString()} actions...`);

	const existingCount = await prisma.action.count({
		where: { projectId },
	});

	if (existingCount > 0) {
		throw new Error(
			`Cannot seed: ${existingCount.toLocaleString()} actions already exist for this project. Delete existing actions first.`,
		);
	}

	const totalBatches = Math.ceil(TOTAL_ACTIONS / ACTION_BATCH_SIZE);
	let totalCreated = 0;
	const actionIds: string[] = [];

	for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
		const remaining = TOTAL_ACTIONS - totalCreated;
		const batchSize = Math.min(ACTION_BATCH_SIZE, remaining);
		const batchData = [];

		for (let i = 0; i < batchSize; i++) {
			const templateId = randomItem(templates).id;
			const action = generateFakeAction(projectId, templateId);
			batchData.push(action);
			actionIds.push(action.id);
		}

		await prisma.action.createMany({
			data: batchData,
		});

		totalCreated += batchSize;
		const percentComplete = ((totalCreated / TOTAL_ACTIONS) * 100).toFixed(1);
		console.log(
			`Batch ${batchNum}/${totalBatches}: Created ${totalCreated.toLocaleString()}/${TOTAL_ACTIONS.toLocaleString()} actions (${percentComplete}%)`,
		);
	}

	console.log(`✅ Created ${totalCreated.toLocaleString()} actions`);
	return actionIds;
}

async function seedEvents(projectId: string, templates: { id: string }[], actionIds: string[]) {
	if (!templates.length) {
		throw new Error("Cannot seed events without templates.");
	}

	if (!actionIds.length) {
		throw new Error("Cannot seed events without actions.");
	}

	console.log(`Seeding ${TOTAL_EVENTS.toLocaleString()} events...`);

	const existingCount = await prisma.event.count({
		where: { projectId },
	});

	if (existingCount > 0) {
		throw new Error(
			`Cannot seed: ${existingCount.toLocaleString()} events already exist for this project. Delete existing events first.`,
		);
	}

	const totalBatches = Math.ceil(TOTAL_EVENTS / EVENT_BATCH_SIZE);
	let totalCreated = 0;
	const maxConnections = Math.max(1, Math.min(3, actionIds.length));

	for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
		const remaining = TOTAL_EVENTS - totalCreated;
		const batchSize = Math.min(EVENT_BATCH_SIZE, remaining);
		const batchPromises: Promise<unknown>[] = [];

		for (let i = 0; i < batchSize; i++) {
			const templateId = randomItem(templates).id;
			const connectCount = faker.number.int({ min: 1, max: maxConnections });
			const connectActions = faker.helpers.arrayElements(actionIds, connectCount).map((id) => ({ id }));

			const name = `Event ${faker.word.adjective()} ${faker.word.noun()}`;

			batchPromises.push(
				prisma.event.create({
					data: {
						name,
						projectId,
						templateId,
						actions: {
							connect: connectActions,
						},
					},
				}),
			);
		}

		await Promise.all(batchPromises);

		totalCreated += batchSize;
		const percentComplete = ((totalCreated / TOTAL_EVENTS) * 100).toFixed(1);
		console.log(
			`Batch ${batchNum}/${totalBatches}: Created ${totalCreated.toLocaleString()}/${TOTAL_EVENTS.toLocaleString()} events (${percentComplete}%)`,
		);
	}

	console.log(`✅ Created ${totalCreated.toLocaleString()} events`);
}

async function fetchProjectContactIds(projectId: string): Promise<string[]> {
	const contacts = await prisma.contact.findMany({
		where: { projectId },
		select: { id: true },
		orderBy: { createdAt: "asc" },
	});

	return contacts.map((contact) => contact.id);
}

function generateFakeCampaign(projectId: string, style: TemplateStyle, status: CampaignStatus) {
	return {
		subject: faker.lorem.sentence(6),
		body: faker.lorem.paragraphs(2),
		email: faker.internet.email(),
		from: faker.internet.email(),
		style,
		status,
		delivered: status === CampaignStatus.DELIVERED ? faker.date.past() : null,
		projectId,
	};
}

async function seedCampaigns(projectId: string) {
	console.log(`Seeding ${TOTAL_CAMPAIGNS.toLocaleString()} campaigns...`);

	const existingCount = await prisma.campaign.count({
		where: { projectId },
	});

	if (existingCount > 0) {
		console.log(`ℹ️  Skipping campaigns: ${existingCount.toLocaleString()} already exist`);
		return;
	}

	const contactIds = await fetchProjectContactIds(projectId);

	if (!contactIds.length) {
		throw new Error("Cannot seed campaigns without contacts.");
	}

	const totalContacts = contactIds.length;
	let contactPointer = 0;

	for (let i = 0; i < TOTAL_CAMPAIGNS; i++) {
		const recipientCount = faker.number.int({ min: MIN_CAMPAIGN_RECIPIENTS, max: MAX_CAMPAIGN_RECIPIENTS });
		const style = randomItem(TEMPLATE_STYLES);
		const status = randomItem(CAMPAIGN_STATUSES);

		const campaign = await prisma.campaign.create({
			data: generateFakeCampaign(projectId, style, status),
		});

		let remaining = recipientCount;

		while (remaining > 0) {
			const batchSize = Math.min(CAMPAIGN_RECIPIENT_BATCH_SIZE, remaining);
			const batchData = [];

			for (let j = 0; j < batchSize; j++) {
				batchData.push({
					campaignId: campaign.id,
					contactId: contactIds[contactPointer],
				});

				contactPointer = (contactPointer + 1) % totalContacts;
			}

			await prisma.campaignRecipient.createMany({
				data: batchData,
				skipDuplicates: true,
			});

			remaining -= batchSize;
		}

		console.log(`Campaign ${i + 1}/${TOTAL_CAMPAIGNS}: ${campaign.id} (${recipientCount.toLocaleString()} recipients)`);
	}

	console.log(`✅ Created ${TOTAL_CAMPAIGNS.toLocaleString()} campaigns`);
}

function generateToken(type: "secret" | "public") {
	return `${type === "secret" ? "sk" : "pk"}_${randomBytes(24).toString("hex")}`;
}

async function seedDefaultUserAndProject() {
	const userEmail = "avi.santoso@gmail.com";
	const projectName = "AviSantoso";
	const projectUrl = "https://leatherimmure.com";
	const projectEmail = "leatherimmure.com";

	console.log("Seeding default user and project...");

	let user = await prisma.user.findUnique({
		where: { email: userEmail },
	});

	if (!user) {
		const hashedPassword = await bcrypt.hash("password123", 10);
		user = await prisma.user.create({
			data: {
				email: userEmail,
				password: hashedPassword,
			},
		});
		console.log(`✅ Created user: ${userEmail}`);
	} else {
		console.log(`ℹ️  User already exists: ${userEmail}`);
		if (!user.password) {
			const hashedPassword = await bcrypt.hash("password123", 10);
			user = await prisma.user.update({
				where: { id: user.id },
				data: { password: hashedPassword },
			});
			console.log(`✅ Updated password for user: ${userEmail}`);
		}
	}

	let project = await prisma.project.findFirst({
		where: {
			OR: [{ name: projectName }, { email: projectEmail }],
		},
	});

	if (!project) {
		let secretKey = "";
		let secretIsAvailable = false;
		let publicKey = "";
		let publicIsAvailable = false;

		while (!secretIsAvailable) {
			secretKey = generateToken("secret");
			const existing = await prisma.project.findUnique({ where: { secret: secretKey } });
			secretIsAvailable = !existing;
		}

		while (!publicIsAvailable) {
			publicKey = generateToken("public");
			const existing = await prisma.project.findUnique({ where: { public: publicKey } });
			publicIsAvailable = !existing;
		}

		project = await prisma.project.create({
			data: {
				name: projectName,
				url: projectUrl,
				email: projectEmail,
				verified: true,
				secret: secretKey,
				public: publicKey,
				memberships: {
					create: [{ userId: user.id, role: "OWNER" }],
				},
			},
		});
		console.log(`✅ Created project: ${projectName} (${project.id})`);
		console.log(`   URL: ${projectUrl}`);
		console.log(`   Email: ${projectEmail} (verified)`);
		console.log(`   Public Key: ${publicKey}`);
		console.log(`   Secret Key: ${secretKey}`);
	} else {
		console.log(`ℹ️  Project already exists: ${projectName} (${project.id})`);

		const membership = await prisma.projectMembership.findUnique({
			where: {
				userId_projectId: {
					userId: user.id,
					projectId: project.id,
				},
			},
		});

		if (!membership) {
			await prisma.projectMembership.create({
				data: {
					userId: user.id,
					projectId: project.id,
					role: "OWNER",
				},
			});
			console.log(`✅ Created membership for user`);
		}
	}

	return project.id;
}

async function main() {
	let defaultProjectId: string | undefined;

	try {
		defaultProjectId = await seedDefaultUserAndProject();
	} catch (error) {
		console.error("Error seeding default user and project:", error instanceof Error ? error.message : error);
		process.exit(1);
	}

	const projectId = process.argv[2] || defaultProjectId;

	if (!projectId) {
		console.log("\nℹ️  No projectId available, skipping contact seeding");
		console.log("Usage: yarn seed <projectId>");
		await prisma.$disconnect();
		return;
	}

	try {
		const templates = await seedTemplates(projectId);
		const actionIds = await seedActions(projectId, templates);
		await seedEvents(projectId, templates, actionIds);
		await seedContacts(projectId);
		await seedCampaigns(projectId);
	} catch (error) {
		console.error("Error seeding data:", error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();
