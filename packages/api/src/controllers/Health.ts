import { Controller, Get } from "@overnightjs/core";
import type { Request, Response } from "express";
import { MAX_EMAILS_PER_MINUTE } from "../app/constants";

@Controller("health")
export class Health {
	@Get("")
	public async health(req: Request, res: Response) {
		return res.json({ success: true });
	}

	@Get("config")
	public async config(req: Request, res: Response) {
		return res.json({ emailsPerMinute: MAX_EMAILS_PER_MINUTE });
	}
}
