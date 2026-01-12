import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class CronoPublicApi implements ICredentialType {
	name = 'cronoPublicApi';
	documentationUrl = 'https://ext.crono.one/docs';
	displayName = 'Crono Public API';

	icon: Icon = 'file:../nodes/CronoPublicApi/crono.svg'

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			description: 'Optional override. Leave empty to use the default base URL.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
				'X-Api-Secret': '={{$credentials.apiSecret}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://ext.crono.one"}}',
			url: '/api/v1/Users',
			method: 'GET',
		},
	};
}
