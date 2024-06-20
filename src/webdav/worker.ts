import WebDAVServer from "@filen/webdav"
import { type WebDAVWorkerMessage } from "."
import { type FilenDesktopConfig } from "../types"
import { serializeError } from "../lib/worker"
import { isPortInUse } from "../utils"

let config: FilenDesktopConfig | null = null

process.on("message", (message: WebDAVWorkerMessage) => {
	if (message.type === "config") {
		config = message.config
	}
})

export function waitForConfig(): Promise<FilenDesktopConfig> {
	return new Promise<FilenDesktopConfig>(resolve => {
		if (config) {
			resolve(config)

			return
		}

		const wait = setInterval(() => {
			if (config) {
				clearInterval(wait)

				resolve(config)
			}
		}, 100)
	})
}

export async function main(): Promise<void> {
	if (!process.argv.slice(2).includes("--filen-desktop-worker")) {
		return
	}

	const config = await waitForConfig()

	if (await isPortInUse(config.webdavConfig.port)) {
		throw new Error(`Cannot start WebDAV server on ${config.webdavConfig.hostname}:${config.webdavConfig.port}: Port in use.`)
	}

	const server = new WebDAVServer({
		port: config.webdavConfig.port,
		hostname: config.webdavConfig.hostname,
		user: !config.webdavConfig.proxyMode
			? {
					username: config.webdavConfig.username,
					password: config.webdavConfig.password,
					sdkConfig: config.sdkConfig
			  }
			: undefined,
		https: config.webdavConfig.https,
		authMode: config.webdavConfig.proxyMode ? "basic" : config.webdavConfig.authMode
	})

	await server.start()

	if (process.send) {
		process.send({
			type: "started"
		} satisfies WebDAVWorkerMessage)
	}
}

main().catch(err => {
	if (process.send) {
		process.send({
			type: "error",
			error: serializeError(err)
		} satisfies WebDAVWorkerMessage)
	}
})
