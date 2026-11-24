import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { refreshAccessToken } from './auth';
import { ensureWorkspace } from './sheets';
import { clearSession, setSession } from './session';
import type { SheetIds } from '#lib/types.ts';

export type WorkspaceContext = {
	accessToken: string;
	spreadsheetId: string;
	sheetIds: SheetIds;
	sheetUrl: string;
};

function hasSheetIds(sheetIds: SheetIds | undefined): sheetIds is SheetIds {
	return (
		!!sheetIds &&
		typeof sheetIds.transactions === 'number' &&
		typeof sheetIds.categories === 'number' &&
		typeof sheetIds.settings === 'number'
	);
}

/**
 * Refreshes the user's Google access token and makes sure their finance
 * spreadsheet exists. Redirects home when the session can no longer be used.
 */
export async function getWorkspace(
	locals: App.Locals,
	cookies: Cookies
): Promise<WorkspaceContext> {
	const session = locals.session;
	if (!session) redirect(303, '/');

	let accessToken: string;
	try {
		accessToken = await refreshAccessToken(session.refreshToken);
	} catch (error) {
		console.error('Could not refresh Google access token:', error);
		clearSession(cookies);
		redirect(303, '/?error=session_expired');
	}

	let spreadsheetId = session.spreadsheetId;
	let sheetIds = session.sheetIds;

	if (!spreadsheetId || !hasSheetIds(sheetIds)) {
		try {
			const workspace = await ensureWorkspace(accessToken);
			spreadsheetId = workspace.spreadsheetId;
			sheetIds = workspace.sheetIds;

			const updated = { ...session, spreadsheetId, sheetIds };
			locals.session = updated;
			await setSession(cookies, updated);
		} catch (error) {
			console.error('Could not prepare the finance spreadsheet:', error);
			redirect(303, '/?error=sheets_unavailable');
		}
	}

	return {
		accessToken,
		spreadsheetId,
		sheetIds,
		sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
	};
}
