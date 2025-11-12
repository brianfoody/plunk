export const API_URI = process.env.NEXT_PUBLIC_API_URI ?? 'http://localhost:8080';
export const AWS_REGION = process.env.NEXT_PUBLIC_AWS_REGION;

export const NO_AUTH_ROUTES = ['/auth/signup', '/auth/login', '/auth/reset', '/unsubscribe/[id]', '/subscribe/[id]'];

const envItemsPerPage = process.env.NEXT_PUBLIC_ITEMS_PER_PAGE ? parseInt(process.env.NEXT_PUBLIC_ITEMS_PER_PAGE, 10) : 100;
export const ITEMS_PER_PAGE = Math.min(Math.max(envItemsPerPage, 1), 200);
