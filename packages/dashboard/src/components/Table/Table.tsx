import React from "react";
import { Skeleton } from "../Skeleton";

export interface TableProps {
	values: {
		// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
		[key: string]: string | number | boolean | Date | React.ReactNode | null;
	}[];
	isLoading?: boolean;
	error?: any;
	page?: number;
	totalPages?: number;
	total?: number;
	onPageChange?: (page: number) => void;
	searchValue?: string;
	onSearchChange?: (value: string) => void;
	searchPlaceholder?: string;
	// Selection props
	selectable?: boolean;
	selectedIds?: string[];
	onSelectionChange?: (selectedIds: string[]) => void;
	onSelectAll?: () => void;
	onSelectPage?: () => void;
	onClearSelection?: () => void;
	isSelectingAll?: boolean;
	allSelectedCount?: number;
	pageSelectedCount?: number;
	// Custom row renderer for selectable tables
	renderSelectableRow?: (item: any, index: number) => React.ReactNode;
	// Row click handler for selectable tables
	onRowClick?: (item: any, index: number) => void;
}

/**
 * @param root0
 * @param root0.values
 * @param root0.isLoading
 * @param root0.error
 * @param root0.page
 * @param root0.totalPages
 * @param root0.total
 * @param root0.onPageChange
 * @param root0.searchValue
 * @param root0.onSearchChange
 * @param root0.searchPlaceholder
 */
export default function Table({
	values,
	isLoading = false,
	error,
	page,
	totalPages,
	total,
	onPageChange,
	searchValue,
	onSearchChange,
	searchPlaceholder = "Search...",
	// Selection props
	selectable = false,
	selectedIds = [],
	onSelectionChange,
	onSelectAll,
	onSelectPage,
	onClearSelection,
	isSelectingAll = false,
	allSelectedCount = 0,
	pageSelectedCount = 0,
	// Custom row renderer for selectable tables
	renderSelectableRow,
	// Row click handler for selectable tables
	onRowClick,
}: TableProps) {
	if (isLoading) {
		return <Skeleton type="table" />;
	}

	if (error) {
		return (
			<div className="border rounded-md p-4 text-center text-red-500">
				<div className="text-sm">Error loading data. Please try again.</div>
			</div>
		);
	}

	if (values.length === 0) {
		return (
			<div className="border rounded-md p-4 text-center text-gray-500">
				<div className="text-sm">No data found</div>
			</div>
		);
	}

	// Render the table content
	const renderTableContent = () => (
		<div className="flex flex-col">
			<div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
				<div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
					<div className="overflow-hidden rounded border border-neutral-200">
						<table className="min-w-full">
							<thead className="bg-neutral-50">
								<tr>
									{selectable && (
										<th scope="col" className="w-12 px-6 py-3 text-xs font-medium text-neutral-800">
											{/* Checkbox header */}
										</th>
									)}
									{Object.keys(values[0]).map((header) => {
										return (
											<th
												key={header}
												scope="col"
												className={`${
													typeof values[0][header] === "boolean" ? "text-center" : "text-left"
												} px-6 py-3 text-xs font-medium text-neutral-800`}
											>
												{header}
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								{values.map((row, index) => {
									return (
										<tr
											key={index}
											className={`border-t border-neutral-100 bg-white transition ease-in-out hover:bg-neutral-50 ${
												selectable ? "cursor-pointer" : ""
											}`}
											onClick={selectable && onRowClick ? () => onRowClick(row, index) : undefined}
										>
											{selectable && (
												<td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500">
													{renderSelectableRow ? (
														renderSelectableRow(row, index)
													) : (
														<input
															type="checkbox"
															className="rounded border-neutral-300 text-neutral-800 focus:ring-neutral-800"
														/>
													)}
												</td>
											)}
											{Object.entries(row).map((value, valueIndex) => {
												if (value[1] === null || value[1] === undefined) {
													return (
														<td
															key={valueIndex}
															className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500"
														>
															Not specified
														</td>
													);
												}

												if (typeof value[1] === "boolean") {
													return (
														<td
															key={valueIndex}
															className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500"
														>
															{value[1] ? (
																<svg
																	className={
																		"mx-auto h-7 w-7 rounded-full bg-green-50 p-1 text-green-500"
																	}
																	fill="none"
																	viewBox="0 0 24 24"
																>
																	<path
																		stroke="currentColor"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth="1.5"
																		d="M5.75 12.8665L8.33995 16.4138C9.15171 17.5256 10.8179 17.504 11.6006 16.3715L18.25 6.75"
																	/>
																</svg>
															) : (
																<svg
																	className={"mx-auto h-7 w-7 rounded-full bg-red-50 p-1 text-red-500"}
																	width="24"
																	height="24"
																	fill="none"
																	viewBox="0 0 24 24"
																>
																	<path
																		stroke="currentColor"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth="1.5"
																		d="M17.25 6.75L6.75 17.25"
																	/>
																	<path
																		stroke="currentColor"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth="1.5"
																		d="M6.75 6.75L17.25 17.25"
																	/>
																</svg>
															)}
														</td>
													);
												}

												// Handle Date objects
												if (value[1] instanceof Date) {
													return (
														<td
															key={valueIndex}
															className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500"
														>
															{value[1].toLocaleDateString()}
														</td>
													);
												}

												return (
													<td key={valueIndex} className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500">
														{value[1] as React.ReactNode}
													</td>
												);
											})}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);

	// If no additional features are needed, return just the table
	if (!onPageChange && !selectable && !onSearchChange) {
		return renderTableContent();
	}

	// Enhanced table with conditional features
	return (
		<div className="space-y-4">
			{/* Search Bar and Selection Buttons */}
			{(onSearchChange || selectable) && (
				<div className="flex items-center gap-4">
					{/* Search input */}
					{onSearchChange && (
						<div className="flex-1 relative">
							<input
								type="text"
								placeholder={searchPlaceholder}
								value={searchValue || ""}
								onChange={(e) => onSearchChange(e.target.value)}
								className="w-full px-3 py-2 border border-neutral-300 rounded text-sm transition ease-in-out focus:border-neutral-800 focus:ring-neutral-800"
							/>
						</div>
					)}

					{/* Selection Buttons */}
					{selectable && (
						<div className="flex gap-2">
							{onSelectAll && (
								<button
									type="button"
									onClick={onSelectAll}
									className="flex items-center justify-center gap-x-1 rounded border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-medium text-neutral-800 transition ease-in-out hover:bg-neutral-100"
								>
									Select All ({allSelectedCount})
								</button>
							)}
							{onSelectPage && (
								<button
									type="button"
									onClick={onSelectPage}
									className="flex items-center justify-center gap-x-1 rounded border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-medium text-neutral-800 transition ease-in-out hover:bg-neutral-100"
								>
									Select Page ({pageSelectedCount})
								</button>
							)}
							{onClearSelection && (
								<button
									type="button"
									onClick={onClearSelection}
									className="flex items-center justify-center gap-x-1 rounded border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-medium text-neutral-800 transition ease-in-out hover:bg-neutral-100"
								>
									Clear All
								</button>
							)}
						</div>
					)}
				</div>
			)}

			{/* Table */}
			{renderTableContent()}

			{/* Pagination and Selection Info */}
			{((totalPages && totalPages > 1) || selectable) && (
				<div className="flex justify-between items-center">
					<span className="text-sm text-gray-600">
						{totalPages && totalPages > 1 && `Page ${page} of ${totalPages} - ${total} total items`}
						{selectable && (isSelectingAll ? allSelectedCount > 0 : selectedIds.length > 0) && (
							<>
								{totalPages && totalPages > 1 && " "}(
								{isSelectingAll ? `${allSelectedCount} selected` : `${selectedIds.length} selected`})
							</>
						)}
					</span>
					{totalPages && totalPages > 1 && onPageChange && (
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => onPageChange(Math.max(1, page! - 1))}
								disabled={page! <= 1}
								className="px-3 py-1 text-sm border rounded disabled:opacity-50"
							>
								Previous
							</button>
							<button
								type="button"
								onClick={() => onPageChange(Math.min(totalPages, page! + 1))}
								disabled={page! >= totalPages}
								className="px-3 py-1 text-sm border rounded disabled:opacity-50"
							>
								Next
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
