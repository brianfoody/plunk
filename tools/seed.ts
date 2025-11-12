import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

const TOTAL_RECORDS = 1_000_000;
const BATCH_SIZE = 10_000;

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

async function main() {
	const projectId = process.argv[2];

	if (!projectId) {
		console.error("Error: projectId is required");
		console.error("Usage: yarn seed <projectId>");
		process.exit(1);
	}

	try {
		await seedContacts(projectId);
	} catch (error) {
		console.error("Error seeding contacts:", error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();
