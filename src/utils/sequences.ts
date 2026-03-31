export interface SequenceRenderEvent {
	eventType: string;
	playerId?: number;
	playerName: string;
	videoTimestamp?: number;
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

export interface SequenceRenderData<T extends SequenceRenderEvent> {
	sequenceLabels: string[];
	markerEvents: T[];
}

const round2 = (value: number): string => value.toFixed(2);

const isReceivedType = (eventType: string): boolean => {
	return eventType.toLowerCase().includes('received');
};

const isDirectionalEvent = (event: SequenceRenderEvent): boolean => {
	return !(event.endX === 0 && event.endY === 0);
};

const samePathKey = (event: SequenceRenderEvent): string => {
	return `${round2(event.startX)}:${round2(event.startY)}:${round2(event.endX)}:${round2(event.endY)}:${round2(event.videoTimestamp ?? 0)}`;
};

const formatPlayerToken = (event: SequenceRenderEvent): string => {
	const prefix = typeof event.playerId === 'number' ? `#${event.playerId}` : '#?';
	return `${prefix} ${event.playerName}`;
};

const appendIfChanged = (chain: string[], next: string | undefined) => {
	if (!next) return;
	if (chain.length === 0 || chain[chain.length - 1] !== next) {
		chain.push(next);
	}
};

export function buildSequenceRenderData<T extends SequenceRenderEvent>(
	events: T[],
	getSequenceKey: (event: T) => string | undefined,
): SequenceRenderData<T> {
	const directional = events.filter(isDirectionalEvent);
	const ordered = [...directional].sort(
		(a, b) => (a.videoTimestamp ?? 0) - (b.videoTimestamp ?? 0),
	);

	const receivedByPath = new Map<string, T>();
	for (const event of ordered) {
		if (isReceivedType(event.eventType)) {
			receivedByPath.set(samePathKey(event), event);
		}
	}

	const markerByStart = new Map<string, T>();
	for (const event of ordered) {
		const seqKey = getSequenceKey(event) ?? 'ungrouped';
		const startKey = `${seqKey}:${round2(event.startX)}:${round2(event.startY)}`;
		const existing = markerByStart.get(startKey);
		if (!existing) {
			markerByStart.set(startKey, event);
			continue;
		}
		// Prefer source events so start markers keep the passer identity.
		if (isReceivedType(existing.eventType) && !isReceivedType(event.eventType)) {
			markerByStart.set(startKey, event);
		}
	}

	const grouped = new Map<string, T[]>();
	for (const event of ordered) {
		const seqKey = getSequenceKey(event);
		if (!seqKey) continue;
		if (!grouped.has(seqKey)) grouped.set(seqKey, []);
		grouped.get(seqKey)!.push(event);
	}

	const sequenceLabels: string[] = [];
	for (const [, group] of grouped.entries()) {
		const chain: string[] = [];
		for (const event of group) {
			if (isReceivedType(event.eventType)) continue;
			appendIfChanged(chain, formatPlayerToken(event));

			const receiver = receivedByPath.get(samePathKey(event));
			appendIfChanged(chain, receiver ? formatPlayerToken(receiver) : undefined);
		}

		if (chain.length === 0) {
			for (const event of group) {
				appendIfChanged(chain, formatPlayerToken(event));
			}
		}

		if (chain.length > 0) {
			sequenceLabels.push(chain.join(' -> '));
		}
	}

	return {
		sequenceLabels,
		markerEvents: [...markerByStart.values()],
	};
}
