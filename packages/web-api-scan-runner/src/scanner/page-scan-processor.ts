// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { System } from 'common';
import { inject, injectable } from 'inversify';
import { GlobalLogger } from 'logger';
import { AxeScanResults, BrowserLaunchMechanism, Page } from 'scanner-global-library';
import { OnDemandPageScanResult } from 'storage-documents';
import { AxeScanner } from '../scanner/axe-scanner';
import { ScanMetadata } from '../types/scan-metadata';
import { DeepScanner } from './deep-scanner';

@injectable()
export class PageScanProcessor {
    public constructor(
        @inject(Page) private readonly page: Page,
        @inject(AxeScanner) private readonly axeScanner: AxeScanner,
        @inject(DeepScanner) private readonly deepScanner: DeepScanner,
        @inject(GlobalLogger) private readonly logger: GlobalLogger,
    ) {}

    public async scan(scanMetadata: ScanMetadata, pageScanResult: OnDemandPageScanResult): Promise<AxeScanResults> {
        let axeScanResults: AxeScanResults;
        try {
            const pageOpenMechanism = await this.openPage(scanMetadata.url);

            axeScanResults = {
                browserLaunchMechanism: pageOpenMechanism,
                ...(await this.axeScanner.scan(this.page)),
            };
            this.logger.logInfo('The axe scanner completed a page scan.');

            if (scanMetadata.deepScan) {
                if (this.page.isOpen()) {
                    await this.deepScanner.runDeepScan(scanMetadata, pageScanResult, this.page);
                    this.logger.logInfo('The deep scanner completed a page scan.');
                } else {
                    this.logger.logError('Page is not ready. Unable to perform deep scan.');
                }
            }
        } finally {
            await this.closePage();
        }

        return axeScanResults;
    }

    private async openPage(url: string): Promise<BrowserLaunchMechanism> {
        let mechanism: BrowserLaunchMechanism = 'remote';
        try {
            await this.page.create({
                browserWSEndpoint: `ws://host.docker.internal:8585`,
            });
        } catch (e) {
            this.logger.logError('Could not connect to remote browser, falling back to local launch', { error: System.serializeError(e) });
            await this.page.create();
            mechanism = 'local';
        }
        await this.page.navigateToUrl(url);

        return mechanism;
    }

    private async closePage(): Promise<void> {
        try {
            await this.page.close();
        } catch (error) {
            this.logger.logError('An error occurred while closing web browser.', { error: System.serializeError(error) });
        }
    }
}
