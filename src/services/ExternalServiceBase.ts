// src/services/ExternalServiceBase.ts
import { openTransport } from '@chelys/peer/TransportFactory';
import { resolveTransportConfig } from '@chelys/peer/TransportResolution';
import type {
	ClientTransport,
	TransportConfig,
	TransportStatus,
} from '@chelys/types/transport';

import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('ExternalServiceBase');

export type StatusListener = (
	configId: string,
	status: TransportStatus,
) => void;

export interface ExternalServiceConfig {
	id: string;
	name: string;
	enabled: boolean;
	icon?: string;
	transportConfig: TransportConfig;
}

interface PendingOpen {
	epoch: number;
	promise: Promise<ClientTransport>;
}

export abstract class ExternalServiceBase<
	TConfig extends ExternalServiceConfig,
> {
	protected readonly configs = new Map<string, TConfig>();
	protected readonly transports = new Map<string, ClientTransport>();

	private readonly connectionStatuses = new Map<string, TransportStatus>();
	private readonly statusListeners = new Set<StatusListener>();
	private readonly pendingOpens = new Map<string, PendingOpen>();
	private readonly openEpochs = new Map<string, number>();

	protected abstract readonly transportLabel: string;

	getConfig(configId: string): TConfig | undefined {
		return this.configs.get(configId);
	}

	getConfigName(configId: string): string | undefined {
		return this.configs.get(configId)?.name;
	}

	getConnectionStatus(configId: string): TransportStatus {
		return this.connectionStatuses.get(configId) ?? 'disconnected';
	}

	onStatusChange(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	protected setConnectionStatus(
		configId: string,
		status: TransportStatus,
	): void {
		this.connectionStatuses.set(configId, status);
		for (const listener of this.statusListeners) {
			try {
				listener(configId, status);
			} catch (error) {
				moduleLog.error('Status listener error:', error);
			}
		}
	}

	protected clearConnectionStatus(configId: string): void {
		this.connectionStatuses.delete(configId);
	}

	protected async openTransport(config: TConfig): Promise<ClientTransport> {
		const current = this.transports.get(config.id);
		if (current?.isOpen) return current;
		if (current) {
			this.transports.delete(config.id);
			current.close();
		}

		const epoch = this.getEpoch(config.id);
		const pending = this.pendingOpens.get(config.id);
		if (pending) {
			if (pending.epoch === epoch) return pending.promise;
			try {
				await pending.promise;
			} catch {
				// A superseded attempt closes itself after observing the new epoch.
			}
			if (this.pendingOpens.get(config.id) === pending) {
				this.pendingOpens.delete(config.id);
			}
			return this.openTransport(config);
		}

		const entry: PendingOpen = {
			epoch,
			promise: this.performOpen(config, epoch),
		};
		this.pendingOpens.set(config.id, entry);

		try {
			return await entry.promise;
		} finally {
			if (this.pendingOpens.get(config.id) === entry) {
				this.pendingOpens.delete(config.id);
			}
		}
	}

	protected closeTransport(configId: string): void {
		this.bumpEpoch(configId);
		const transport = this.transports.get(configId);
		if (!transport) return;
		this.transports.delete(configId);
		transport.close();
	}

	protected abortTransport(configId: string): void {
		this.bumpEpoch(configId);
		const transport = this.transports.get(configId);
		if (!transport) return;
		this.transports.delete(configId);
		if (transport.abort) transport.abort();
		else transport.close();
	}

	protected transportChanged(
		previous: TransportConfig,
		next: TransportConfig,
	): boolean {
		return JSON.stringify(previous) !== JSON.stringify(next);
	}

	protected handleTransportClose(_configId: string): void {}

	protected cleanupTransports(): void {
		const configIds = new Set([
			...this.configs.keys(),
			...this.pendingOpens.keys(),
			...this.transports.keys(),
		]);
		for (const configId of configIds) this.bumpEpoch(configId);
		for (const transport of this.transports.values()) transport.close();
		this.transports.clear();
		this.configs.clear();
		this.connectionStatuses.clear();
		this.statusListeners.clear();
	}

	private async performOpen(
		config: TConfig,
		epoch: number,
	): Promise<ClientTransport> {
		this.setConnectionStatus(config.id, 'connecting');

		try {
			const resolvedConfig = await resolveTransportConfig(
				config.id,
				config.transportConfig,
			);
			const transport = await openTransport(resolvedConfig, {
				label: `${this.transportLabel}:${config.id}`,
			});

			if (!transport.isOpen) {
				transport.close();
				throw new Error(`Transport closed while connecting to ${config.name}`);
			}
			if (this.getEpoch(config.id) !== epoch) {
				transport.close();
				throw new Error(`Transport opening cancelled for ${config.name}`);
			}

			this.installTransport(config, transport);
			this.setConnectionStatus(config.id, 'connected');
			return transport;
		} catch (error) {
			if (this.getEpoch(config.id) === epoch) {
				this.setConnectionStatus(config.id, 'error');
			}
			throw error;
		}
	}

	private installTransport(config: TConfig, transport: ClientTransport): void {
		this.transports.set(config.id, transport);
		transport.onClose(() => {
			if (this.transports.get(config.id) !== transport) return;
			this.transports.delete(config.id);
			this.handleTransportClose(config.id);
			this.setConnectionStatus(config.id, 'disconnected');
		});
		transport.onError((error) => {
			if (this.transports.get(config.id) !== transport) return;
			moduleLog.error(`Transport error for ${config.name}:`, error);
			this.setConnectionStatus(config.id, 'error');
		});
	}

	private getEpoch(configId: string): number {
		return this.openEpochs.get(configId) ?? 0;
	}

	private bumpEpoch(configId: string): void {
		this.openEpochs.set(configId, this.getEpoch(configId) + 1);
	}
}
