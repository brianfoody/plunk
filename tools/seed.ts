import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

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
		await seedContacts(projectId);
	} catch (error) {
		console.error("Error seeding contacts:", error instanceof Error ? error.message : error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();
