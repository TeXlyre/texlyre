// src/components/common/ServiceStatusBanner.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useOffline } from '../../hooks/useOffline';
import { useSettings } from '../../hooks/useSettings';
import { OfflineIcon } from './Icons';

interface ServiceStatus {
	status: 'up' | 'degraded' | 'down';
	down: number;
	degraded: number;
}

const ServiceStatusBanner: React.FC = () => {
	const { getSetting } = useSettings();
	const { isOfflineMode, airgapExternalRequests } = useOffline();
	const [status, setStatus] = useState<ServiceStatus | null>(null);

	const pageUrl = (getSetting('status-page-url')?.value as string) ?? '';
	const jsonUrl = (getSetting('status-json-url')?.value as string) ?? '';
	const enabled = Boolean(jsonUrl) && !isOfflineMode && !airgapExternalRequests;

	useEffect(() => {
		if (!enabled) {
			setStatus(null);
			return;
		}

		const controller = new AbortController();

		fetch(jsonUrl, { signal: controller.signal })
			.then((response) =>
				response.ok ? response.json() : Promise.reject(response.status),
			)
			.then((data: ServiceStatus) => {
				if (data?.status === 'down' || data?.status === 'degraded') {
					setStatus(data);
				}
			})
			.catch(() => undefined);

		return () => controller.abort();
	}, [enabled, jsonUrl]);

	if (!status) return null;

	return (
		<div className='offline-banner service-status-banner'>
			<div className='offline-content'>
				<span className='offline-icon'>
					<OfflineIcon />
				</span>
				<div className='offline-text'>
					<strong>
						{status.status === 'down'
							? t('Some TeXlyre services are unavailable')
							: t('Some TeXlyre services are degraded')}
					</strong>
					<div className='offline-details'>
						{t('Affected services:')} {status.down + status.degraded}
						{pageUrl ? (
							<>
								{' • '}
								<a href={pageUrl} target='_blank' rel='noreferrer'>
									{t('Service Status')}
								</a>
							</>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ServiceStatusBanner;
