/**
 * Runs `poll` every `intervalMs` while the document is visible, and immediately when it becomes visible again.
 * Overlapping polls are skipped.
 */
export function createPoller(poll: () => Promise<void>, intervalMs: number) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let inFlight = false;

	async function run() {
		if (inFlight) return;
		inFlight = true;
		try {
			await poll();
		} finally {
			inFlight = false;
		}
	}

	function start() {
		stop();
		void run();
		timer = setInterval(run, intervalMs);
	}

	function stop() {
		clearInterval(timer);
		timer = undefined;
	}

	function onVisibilityChange() {
		if (document.visibilityState === 'visible') start();
		else stop();
	}

	document.addEventListener('visibilitychange', onVisibilityChange);
	onVisibilityChange();

	return {
		destroy() {
			stop();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		}
	};
}
