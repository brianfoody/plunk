import { Controller, Get } from "@overnightjs/core";
import type { Request, Response } from "express";

@Controller("health")
export class Health {
	@Get("")
	public async health(req: Request, res: Response) {
		return res.json({ success: true });
	}

	@Get("config")
	public async config(req: Request, res: Response) {
		const EMAIL_BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || "20");
		return res.json({ emailsPerMinute: EMAIL_BATCH_SIZE });
	}
}
