/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { BACKUPS, IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';
import { IPath } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService, IEnvironmentConfiguration } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import product from 'vs/platform/product/common/product';
import { memoize } from 'vs/base/common/decorators';
import { onUnexpectedError } from 'vs/base/common/errors';

export class BrowserEnvironmentConfiguration implements IEnvironmentConfiguration {

	constructor(
		private readonly options: IBrowserWorkbenchEnvironmentConstructionOptions,
		private readonly payload: Map<string, string> | undefined,
		private readonly backupHome: URI
	) { }

	@memoize
	get sessionId(): string { return generateUuid(); }

	@memoize
	get remoteAuthority(): string | undefined { return this.options.remoteAuthority; }

	@memoize
	get backupWorkspaceResource(): URI { return joinPath(this.backupHome, this.options.workspaceId); }

	@memoize
	get filesToOpenOrCreate(): IPath[] | undefined {
		if (this.payload) {
			const fileToOpen = this.payload.get('openFile');
			if (fileToOpen) {
				return [{ fileUri: URI.parse(fileToOpen) }];
			}
		}

		return undefined;
	}

	@memoize
	get filesToDiff(): IPath[] | undefined {
		if (this.payload) {
			const fileToDiffDetail = this.payload.get('diffFileDetail');
			const fileToDiffMaster = this.payload.get('diffFileMaster');
			if (fileToDiffDetail && fileToDiffMaster) {
				return [
					{ fileUri: URI.parse(fileToDiffDetail) },
					{ fileUri: URI.parse(fileToDiffMaster) }
				];
			}
		}

		return undefined;
	}

	get highContrast() {
		return false; // could investigate to detect high contrast theme automatically
	}
}

interface IBrowserWorkbenchEnvironmentConstructionOptions extends IWorkbenchConstructionOptions {
	workspaceId: string;
	logsPath: URI;
}

interface IExtensionHostDebugEnvironment {
	params: IExtensionHostDebugParams;
	isExtensionDevelopment: boolean;
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;
	extensionEnabledProposedApi?: string[];
}

export class BrowserWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {

	_serviceBrand: undefined;

	private _configuration: IEnvironmentConfiguration | undefined = undefined;
	get configuration(): IEnvironmentConfiguration {
		if (!this._configuration) {
			this._configuration = new BrowserEnvironmentConfiguration(this.options, this.payload, this.backupHome);
		}

		return this._configuration;
	}

	@memoize
	get isBuilt(): boolean { return !!product.commit; }

	@memoize
	get logsPath(): string { return this.options.logsPath.path; }

	get logLevel(): string | undefined { return this.payload?.get('logLevel'); }

	@memoize
	get logFile(): URI { return joinPath(this.options.logsPath, 'window.log'); }

	@memoize
	get userRoamingDataHome(): URI { return URI.file('/User').with({ scheme: Schemas.userData }); }

	@memoize
	get settingsResource(): URI { return joinPath(this.userRoamingDataHome, 'settings.json'); }

	@memoize
	get argvResource(): URI { return joinPath(this.userRoamingDataHome, 'argv.json'); }

	@memoize
	get snippetsHome(): URI { return joinPath(this.userRoamingDataHome, 'snippets'); }

	@memoize
	get userDataSyncHome(): URI { return joinPath(this.userRoamingDataHome, 'sync'); }

	@memoize
	get userDataSyncLogResource(): URI { return joinPath(this.options.logsPath, 'userDataSync.log'); }

	get sync(): 'on' | 'off' { return 'on'; }

	@memoize
	get keybindingsResource(): URI { return joinPath(this.userRoamingDataHome, 'keybindings.json'); }

	@memoize
	get keyboardLayoutResource(): URI { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }

	@memoize
	get backupHome(): URI { return joinPath(this.userRoamingDataHome, BACKUPS); }

	@memoize
	get untitledWorkspacesHome(): URI { return joinPath(this.userRoamingDataHome, 'Workspaces'); }

	private _extensionHostDebugEnvironment: IExtensionHostDebugEnvironment | undefined = undefined;
	get debugExtensionHost(): IExtensionHostDebugParams {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.params;
	}

	get isExtensionDevelopment(): boolean {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.isExtensionDevelopment;
	}

	get extensionDevelopmentLocationURI(): URI[] | undefined {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
	}

	get extensionTestsLocationURI(): URI | undefined {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.extensionTestsLocationURI;
	}

	get extensionEnabledProposedApi(): string[] | undefined {
		if (!this._extensionHostDebugEnvironment) {
			this._extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
		}

		return this._extensionHostDebugEnvironment.extensionEnabledProposedApi;
	}

	get disableExtensions() { return this.payload?.get('disableExtensions') === 'true'; }

	@memoize
	get webviewExternalEndpoint(): string {
		// TODO@matt: get fallback from product.json
		return (this.options.webviewEndpoint || 'https://{{uuid}}.vscode-webview-test.com/{{commit}}').replace('{{commit}}', product.commit || '0d728c31ebdf03869d2687d9be0b017667c9ff37');
	}

	@memoize
	get webviewResourceRoot(): string {
		return `${this.webviewExternalEndpoint}/vscode-resource/{{resource}}`;
	}

	@memoize
	get webviewCspSource(): string {
		return this.webviewExternalEndpoint.replace('{{uuid}}', '*');
	}

	get disableTelemetry(): boolean { return false; }

	get verbose(): boolean { return this.payload?.get('verbose') === 'true'; }
	get logExtensionHostCommunication(): boolean { return this.payload?.get('logExtensionHostCommunication') === 'true'; }

	private payload: Map<string, string> | undefined;

	constructor(readonly options: IBrowserWorkbenchEnvironmentConstructionOptions) {
		if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
			try {
				this.payload = new Map(options.workspaceProvider.payload);
			} catch (error) {
				onUnexpectedError(error); // possible invalid payload for map
			}
		}
	}

	private resolveExtensionHostDebugEnvironment(): IExtensionHostDebugEnvironment {
		const extensionHostDebugEnvironment: IExtensionHostDebugEnvironment = {
			params: {
				port: null,
				break: false
			},
			isExtensionDevelopment: false,
			extensionDevelopmentLocationURI: undefined
		};

		// Fill in selected extra environmental properties
		if (this.payload) {
			for (const [key, value] of this.payload) {
				switch (key) {
					case 'extensionDevelopmentPath':
						extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [URI.parse(value)];
						extensionHostDebugEnvironment.isExtensionDevelopment = true;
						break;
					case 'extensionTestsPath':
						extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
						break;
					case 'debugId':
						extensionHostDebugEnvironment.params.debugId = value;
						break;
					case 'inspect-brk-extensions':
						extensionHostDebugEnvironment.params.port = parseInt(value);
						extensionHostDebugEnvironment.params.break = true;
						break;
					case 'enableProposedApi':
						extensionHostDebugEnvironment.extensionEnabledProposedApi = [];
						break;
				}
			}
		}

		return extensionHostDebugEnvironment;
	}
}
