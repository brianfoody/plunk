import { zodResolver } from "@hookform/resolvers/zod";
import { ContactSchemas } from "@plunk/shared";
import type { Template } from "@prisma/client";
import dayjs from "dayjs";
import { AnimatePresence, motion } from "framer-motion";
import { Edit2, Plus } from "lucide-react";
import Link from "next/link";
import React, { useState, useEffect, Fragment } from "react";
import { type FieldError, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { z } from "zod";
import { Card, Empty, FullscreenLoader, Modal, Skeleton, Table, Toggle, Dropdown } from "../../components";
import { Dashboard } from "../../layouts";
import { ITEMS_PER_PAGE } from "../../lib/constants";
import { usePaginatedContacts, useContactsCount } from "../../lib/hooks/contacts";
import { useActiveProject } from "../../lib/hooks/projects";
import { useUser } from "../../lib/hooks/users";
import { useDebounce } from "../../lib/hooks/useDebounce";
import { network } from "../../lib/network";

interface ContactValues {
	email: string;
	data?:
		| {
				[x: string]: string | string[];
		  }
		| null
		| undefined;
	subscribed: boolean;
}

/**
 *
 */
export default function Index() {
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");

	// Debounce search input
	const debouncedSearch = useDebounce(search, 300);

	// Reset page when search changes
	useEffect(() => {
		setPage(1);
	}, [debouncedSearch]);

	const project = useActiveProject();
	const { data: user } = useUser();
	const { data: contactsCount } = useContactsCount();
	const {
		data: paginatedContacts,
		isLoading,
		error,
		mutate,
	} = usePaginatedContacts(page, ITEMS_PER_PAGE, debouncedSearch, statusFilter === "all" ? undefined : statusFilter === "subscribed");

	const [contactModal, setContactModal] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
		watch,
		setValue,
	} = useForm<ContactValues>({
		resolver: zodResolver(ContactSchemas.create),
		defaultValues: {
			subscribed: true,
		},
	});

	const {
		register: dataRegister,
		control,
		getValues: getDataValues,
		reset: dataReset,
	} = useForm({
		resolver: zodResolver(
			z.object({
				data: z
					.array(
						z.object({
							value: z.object({ key: z.string(), value: z.string() }),
						}),
					)
					.min(0),
			}),
		),
		defaultValues: {
			data: [{ value: { key: "", value: "" } }],
		},
	});

	const { fields, append: fieldAppend, remove: fieldRemove } = useFieldArray({ control, name: "data" });

	if (!project || !user) {
		return <FullscreenLoader />;
	}

	const create = (data: ContactValues) => {
		const entries = getDataValues().data.map(({ value }) => [value.key, value.value]);
		let dataObject = {};

		entries.forEach(([key, value]) => {
			Object.assign(dataObject, { [key]: value });
		});

		dataObject = Object.fromEntries(Object.entries(dataObject).filter(([, value]) => value !== ""));

		toast.promise(
			network.mock<Template, typeof ContactSchemas.create>(project.secret, "POST", "/v1/contacts", {
				...data,
				data: dataObject,
			}),
			{
				loading: "Creating new contact",
				success: () => {
					void mutate();
					reset();
					return "Created new contacts";
				},
				error: "Could not create new contact!",
			},
		);

		reset();
		dataReset();

		setContactModal(false);
	};

	const renderContacts = () => {
		if (isLoading || !paginatedContacts) {
			return <Skeleton type={"table"} />;
		}

		if (error) {
			return (
				<div className="border rounded-md p-4 text-center text-red-500">
					<div className="text-sm">Error loading contacts. Please try again.</div>
				</div>
			);
		}

		if (paginatedContacts.contacts.length > 0) {
			return (
				<Table
					values={paginatedContacts.contacts
						.sort((a, b) => {
							const aTrigger = a.triggers.length > 0 ? a.triggers.sort()[0].createdAt : a.createdAt;
							const bTrigger = b.triggers.length > 0 ? b.triggers.sort()[0].createdAt : b.createdAt;
							return bTrigger > aTrigger ? 1 : -1;
						})
						.map((u) => {
							return {
								Email: u.email,
								"Last Activity": formatRelativeTime(
									u.triggers.length > 0
										? u.triggers.sort((a, b) => {
												return a.createdAt > b.createdAt ? -1 : 1;
										  })[0].createdAt
										: u.createdAt,
								),
								Subscribed: u.subscribed,
								Edit: (
									<Link href={`/contacts/${u.id}`} className={"transition hover:text-neutral-800"}>
										<Edit2 size={18} />
									</Link>
								),
							};
						})}
					page={page}
					totalPages={paginatedContacts.totalPages}
					total={paginatedContacts.total}
					onPageChange={setPage}
				/>
			);
		}

		return (
			<Empty
				title={"No contacts"}
				description={
					debouncedSearch
						? `No contacts found matching "${debouncedSearch}"`
						: "New contacts will automatically be added when they trigger an event"
				}
			/>
		);
	};

	return (
		<>
			<Modal
				isOpen={contactModal}
				onToggle={() => setContactModal(!contactModal)}
				onAction={handleSubmit(create)}
				type={"info"}
				action={"Create"}
				title={"Create new contact"}
			>
				<div>
					<label htmlFor={"email"} className="block text-sm font-medium text-neutral-700">
						Email
					</label>
					<div className="mt-1">
						<input
							type={"text"}
							autoComplete={"off"}
							className={
								"block w-full rounded border-neutral-300 transition ease-in-out focus:border-neutral-800 focus:ring-neutral-800 sm:text-sm"
							}
							placeholder={"hello@useplunk.com"}
							{...register("email")}
						/>
					</div>
					<AnimatePresence>
						{errors.email?.message && (
							<motion.p
								initial={{ height: 0 }}
								animate={{ height: "auto" }}
								exit={{ height: 0 }}
								className="mt-1 text-xs text-red-500"
							>
								{errors.email.message}
							</motion.p>
						)}
					</AnimatePresence>
				</div>

				<div className={"my-6"}>
					<div className={"grid sm:col-span-2"}>
						<div className={"grid items-center gap-3 sm:grid-cols-9"}>
							<label htmlFor={"data"} className="block text-sm font-medium text-neutral-700 sm:col-span-8">
								Metadata
							</label>
							<button
								onClick={(e) => {
									e.preventDefault();
									fieldAppend({ value: { key: "", value: "" } });
								}}
								className={
									"ml-auto flex w-full items-center justify-center gap-x-0.5 rounded border border-neutral-200 bg-white py-1 text-center text-sm text-neutral-700 transition ease-in-out hover:bg-neutral-50 sm:col-span-1"
								}
							>
								<svg width="24" height="24" fill="none" viewBox="0 0 24 24">
									<path
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="1.5"
										d="M12 5.75V18.25"
									/>
									<path
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="1.5"
										d="M18.25 12L5.75 12"
									/>
								</svg>
							</button>
						</div>

						{fields.length > 0 ? (
							fields.map((field, index) => {
								// @ts-ignore
								return (
									<Fragment key={field.id}>
										<div>
											<div className="grid w-full grid-cols-9 items-end gap-3">
												<div className={"col-span-4"}>
													<label htmlFor={"data"} className="text-xs font-light">
														Key
													</label>
													<input
														type={"text"}
														placeholder={"Key"}
														className={
															"block w-full rounded border-neutral-300 transition ease-in-out focus:border-neutral-800 focus:ring-neutral-800 sm:text-sm"
														}
														key={field.id}
														{...dataRegister(`data.${index}.value.key`)}
													/>
												</div>
												<div className={"col-span-4"}>
													<label htmlFor={"data"} className="text-xs font-light">
														Value
													</label>
													<input
														type={"text"}
														placeholder={"Value"}
														className={
															"block w-full rounded border-neutral-300 transition ease-in-out focus:border-neutral-800 focus:ring-neutral-800 sm:text-sm"
														}
														key={field.id}
														{...dataRegister(`data.${index}.value.value`)}
													/>
												</div>
												<button
													className={
														"col-span-1 flex h-10 items-center justify-center rounded bg-red-100 text-sm text-red-800 transition hover:bg-red-200"
													}
													onClick={(e) => {
														e.preventDefault();
														fieldRemove(index);
													}}
												>
													<svg width="24" height="24" fill="none" viewBox="0 0 24 24">
														<path
															stroke="currentColor"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="1.5"
															d="M6.75 7.75L7.59115 17.4233C7.68102 18.4568 8.54622 19.25 9.58363 19.25H14.4164C15.4538 19.25 16.319 18.4568 16.4088 17.4233L17.25 7.75"
														/>
														<path
															stroke="currentColor"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="1.5"
															d="M9.75 7.5V6.75C9.75 5.64543 10.6454 4.75 11.75 4.75H12.25C13.3546 4.75 14.25 5.64543 14.25 6.75V7.5"
														/>
														<path
															stroke="currentColor"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="1.5"
															d="M5 7.75H19"
														/>
													</svg>
												</button>
											</div>
										</div>
									</Fragment>
								);
							})
						) : (
							<p className={"text-sm text-neutral-500"}>No fields added</p>
						)}
					</div>
					<AnimatePresence>
						{(errors.data as FieldError | undefined)?.message && (
							<motion.p
								initial={{ height: 0 }}
								animate={{ height: "auto" }}
								exit={{ height: 0 }}
								className="mt-1 text-xs text-red-500"
							>
								{(errors.data as FieldError | undefined)?.message}
							</motion.p>
						)}
					</AnimatePresence>
				</div>

				<div className={"mt-3"}>
					<Toggle
						title={"Subscribed"}
						description={
							watch("subscribed")
								? "This contact has opted-in to receive marketing emails"
								: "This contact prefers not to receive marketing emails"
						}
						toggled={watch("subscribed")}
						onToggle={() => setValue("subscribed", !watch("subscribed"))}
					/>
				</div>
			</Modal>
			<Dashboard>
				<Card
					title={"Contacts"}
					description={"View and manage your contacts"}
					actions={
						<div className={"flex w-full gap-3 md:w-fit md:flex-row items-center"}>
							<div className="relative flex-1 md:flex-initial">
								<input
									onChange={(e) => setSearch(e.target.value)}
									value={search}
									autoComplete={"off"}
									type="text"
									placeholder={"Search email or metadata..."}
									className={`w-[250px] rounded border-neutral-300 px-3 transition ease-in-out focus:border-neutral-800 focus:ring-neutral-800 sm:text-sm pr-10 ${
										search !== debouncedSearch ? "border-blue-300 bg-blue-50" : ""
									}`}
								/>
							</div>

							<Dropdown
								onChange={(v) => setStatusFilter(v)}
								values={[
									{ name: "All", value: "all" },
									{ name: "Subscribed", value: "subscribed" },
									{ name: "Unsubscribed", value: "unsubscribed" },
								]}
								selectedValue={statusFilter}
								className={"h-full -mt-2 w-40"}
							/>

							<motion.button
								onClick={() => setContactModal(true)}
								whileHover={{ scale: 1.05 }}
								whileTap={{ scale: 0.9 }}
								className={
									"flex items-center gap-x-1 rounded bg-neutral-800 px-8 py-2 text-center text-sm font-medium text-white"
								}
							>
								<Plus strokeWidth={1.5} size={18} />
								New
							</motion.button>
						</div>
					}
				>
					{renderContacts()}
				</Card>
			</Dashboard>
		</>
	);
}
