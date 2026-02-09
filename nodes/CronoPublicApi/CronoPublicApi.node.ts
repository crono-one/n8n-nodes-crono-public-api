import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type CronoResource =
	| 'company'
	| 'contact'
	| 'deal'
	| 'note'
	| 'task'
	| 'activity'
	| 'list'
	| 'pipeline'
	| 'strategy'
	| 'externalProperty'
	| 'user'
	| 'import';

function getJsonParameter(
	executeFunctions: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
	defaultValue: IDataObject = {},
): IDataObject {
	const value = executeFunctions.getNodeParameter(parameterName, itemIndex, defaultValue);

	if (value === '' || value === undefined || value === null) {
		return defaultValue;
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === 'object') {
				return parsed as IDataObject;
			}
		} catch (error) {
			throw new NodeOperationError(executeFunctions.getNode(), error as Error, {
				message: `Parameter "${parameterName}" is not valid JSON.`,
				itemIndex,
			});
		}
	}

	return value as IDataObject;
}

type AdditionalFieldEntry = {
	field?: string;
	value?: string;
};

function addIfNotEmpty(target: IDataObject, key: string, value: unknown) {
	if (value !== undefined && value !== null && value !== '') {
		target[key] = value as IDataObject[keyof IDataObject];
	}
}

function getAdditionalFields(
	executeFunctions: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
): IDataObject {
	const entries = executeFunctions.getNodeParameter(parameterName, itemIndex, []) as AdditionalFieldEntry[];
	const additional: IDataObject = {};

	for (const entry of entries) {
		if (entry.field) {
			additional[entry.field] = entry.value ?? '';
		}
	}

	return additional;
}

function parseCsv(value?: string): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

async function cronoApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
) {
	const credentials = await this.getCredentials('cronoPublicApi');
	const baseUrl = (credentials.baseUrl as string) || 'https://ext.crono.one';

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
	};

	if (qs && Object.keys(qs).length) {
		options.qs = qs;
	}

	if (body && Object.keys(body).length) {
		options.body = body;
	}

	return this.helpers.httpRequestWithAuthentication.call(this, 'cronoPublicApi', options);
}

export class CronoPublicApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Crono',
		name: 'cronoPublicApi',
		icon: 'file:/crono.svg',
		group: ['input'],
		version: 1,
		description: 'Consume the Crono Public API',
		defaults: {
			name: 'Crono Public API',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'cronoPublicApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'API Version',
				name: 'apiVersion',
				type: 'string',
				default: '1',
				description: 'Crono Public API version number',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Activity', value: 'activity' },
					{ name: 'Company', value: 'company' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Deal', value: 'deal' },
					{ name: 'External Property', value: 'externalProperty' },
					{ name: 'Import', value: 'import' },
					{ name: 'List', value: 'list' },
					{ name: 'Note', value: 'note' },
					{ name: 'Pipeline', value: 'pipeline' },
					{ name: 'Strategy', value: 'strategy' },
					{ name: 'Task', value: 'task' },
					{ name: 'User', value: 'user' },
				],
				default: 'company',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['company'] },
				},
				options: [
					{ name: 'Create', value: 'create', action: 'Create a company' },
					{ name: 'Get', value: 'get', action: 'Get a company' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many companies' },
					{ name: 'Import', value: 'import', action: 'Import companies' },
					{ name: 'Search', value: 'search', action: 'Search companies' },
					{ name: 'Update', value: 'update', action: 'Update a company' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['contact'] },
				},
				options: [
					{ name: 'Create', value: 'create', action: 'Create a contact' },
					{ name: 'Get', value: 'get', action: 'Get a contact' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many contacts' },
					{ name: 'Import', value: 'import', action: 'Import contacts' },
					{ name: 'Search', value: 'search', action: 'Search contacts' },
					{ name: 'Update', value: 'update', action: 'Update a contact' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['deal'] },
				},
				options: [
					{ name: 'Create', value: 'create', action: 'Create a deal' },
					{ name: 'Get', value: 'get', action: 'Get a deal' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many deals' },
					{ name: 'Search', value: 'search', action: 'Search deals' },
					{ name: 'Update', value: 'update', action: 'Update a deal' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['note'] },
				},
				options: [
					{ name: 'Create', value: 'create', action: 'Create a note' },
					{ name: 'Get', value: 'get', action: 'Get a note' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many notes' },
					{ name: 'Search', value: 'search', action: 'Search notes' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['task'] },
				},
				options: [
					{ name: 'Create', value: 'create', action: 'Create a task' },
					{ name: 'Search', value: 'search', action: 'Search tasks' },
				],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['activity'] },
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get an activity' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many activities' },
					{ name: 'Search', value: 'search', action: 'Search activities' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['list'] },
				},
				options: [{ name: 'Search', value: 'search', action: 'Search lists' }],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['pipeline'] },
				},
				options: [{ name: 'Get Many', value: 'getAll', action: 'Get many pipelines' }],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['strategy'] },
				},
				options: [
					{ name: 'Search', value: 'search', action: 'Search strategies' },
					{ name: 'Search Details', value: 'searchDetails', action: 'Search strategy details' },
				],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['externalProperty'] },
				},
				options: [{ name: 'Search', value: 'search', action: 'Search external properties' }],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['user'] },
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get a user' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many users' },
					{ name: 'Search', value: 'search', action: 'Search users' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['import'] },
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get an import' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many imports' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Object ID',
				name: 'objectId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'activity'],
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'Import ID',
				name: 'importId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['import'],
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				description: 'Max number of results to return',
				default: 50,
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'activity', 'user', 'import'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'activity', 'user', 'import'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Include Options (JSON)',
				name: 'includeOptions',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'activity'],
						operation: ['get', 'getAll'],
					},
				},
				description: 'JSON object of include options to add as query parameters',
			},
			{
				displayName: 'Use Raw JSON',
				name: 'useRawJsonSearch',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: [
							'company',
							'contact',
							'deal',
							'note',
							'activity',
							'list',
							'strategy',
							'externalProperty',
							'user',
							'task',
						],
						operation: ['search', 'searchDetails'],
					},
				},
				description: 'Whether to send a raw JSON search payload',
			},
			{
				displayName: 'Search (JSON)',
				name: 'search',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: [
							'company',
							'contact',
							'deal',
							'note',
							'activity',
							'list',
							'strategy',
							'externalProperty',
							'user',
							'task',
						],
						operation: ['search', 'searchDetails'],
						useRawJsonSearch: [true],
					},
				},
				description: 'Raw JSON search request body',
			},
			{
				displayName: 'Use Raw JSON',
				name: 'useRawJsonData',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'task'],
						operation: ['create', 'update', 'import'],
					},
				},
				description: 'Whether to send a raw JSON data payload',
			},
			{
				displayName: 'Data (JSON)',
				name: 'data',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'task'],
						operation: ['create', 'update', 'import'],
						useRawJsonData: [true],
					},
				},
				description: 'Raw data object. The node wraps it under "data" automatically.',
			},
			{
				displayName: 'Additional Fields',
				name: 'dataAdditionalFields',
				type: 'collection',
				typeOptions: {
					multipleValueButtonText: 'Add Field',
					multipleValues: true,
				},
				default: [],
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'task'],
						operation: ['create', 'update', 'import'],
						useRawJsonData: [false],
					},
				},
				description: 'Additional data fields to merge into the payload',
				options: [
					{
						displayName: 'Field',
						name: 'field',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'searchAdditionalFields',
				type: 'collection',
				typeOptions: {
					multipleValueButtonText: 'Add Field',
					multipleValues: true,
				},
				default: [],
				displayOptions: {
					show: {
						resource: [
							'company',
							'contact',
							'deal',
							'note',
							'activity',
							'list',
							'strategy',
							'externalProperty',
							'user',
							'task',
						],
						operation: ['search', 'searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Additional search fields to merge into the payload',
				options: [
					{
						displayName: 'Field',
						name: 'field',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
			{
				displayName: 'With Opportunities',
				name: 'withOpportunities',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
					},
				},
				description: 'Whether to include opportunities in task search results',
			},
			{
				displayName: 'Scrape Options (JSON)',
				name: 'scrapeOptions',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company', 'contact'],
						operation: ['create'],
					},
				},
				description: 'Optional scrape options',
			},
			{
				displayName: 'Name',
				name: 'companyCreateName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company name',
			},
			{
				displayName: 'Website',
				name: 'companyCreateWebsite',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company website',
			},
			{
				displayName: 'LinkedIn',
				name: 'companyCreateLinkedin',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'LinkedIn URL',
			},
			{
				displayName: 'Industry',
				name: 'companyCreateIndustry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company industry',
			},
			{
				displayName: 'Country',
				name: 'companyCreateCountry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company country',
			},
			{
				displayName: 'Phone',
				name: 'companyCreatePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company phone',
			},
			{
				displayName: 'Annual Revenue',
				name: 'companyCreateAnnualRevenue',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company annual revenue',
			},
			{
				displayName: 'Create In CRM',
				name: 'companyCreateCreateInCrm',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether to create the company in the connected CRM',
			},
			{
				displayName: 'External Values (JSON)',
				name: 'companyCreateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'LinkedIn Numeric ID',
				name: 'companyCreateLinkedinNumericId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'List ID',
				name: 'companyCreateListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'List ID to associate with the company',
			},
			{
				displayName: 'Number Of Employees',
				name: 'companyCreateNumberOfEmployees',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Owner ID',
				name: 'companyCreateOwnerId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'User ID',
				name: 'companyCreateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'companyUpdateName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company name',
			},
			{
				displayName: 'Website',
				name: 'companyUpdateWebsite',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company website',
			},
			{
				displayName: 'LinkedIn',
				name: 'companyUpdateLinkedin',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'LinkedIn URL',
			},
			{
				displayName: 'Industry',
				name: 'companyUpdateIndustry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company industry',
			},
			{
				displayName: 'Country',
				name: 'companyUpdateCountry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company country',
			},
			{
				displayName: 'Phone',
				name: 'companyUpdatePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company phone',
			},
			{
				displayName: 'Annual Revenue',
				name: 'companyUpdateAnnualRevenue',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company annual revenue',
			},
			{
				displayName: 'External Values (JSON)',
				name: 'companyUpdateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'LinkedIn Numeric ID',
				name: 'companyUpdateLinkedinNumericId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Number Of Employees',
				name: 'companyUpdateNumberOfEmployees',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'User ID',
				name: 'companyUpdateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Accounts',
				name: 'companyImportAccounts',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Accounts to import',
				options: [
					{
						name: 'account',
						displayName: 'Account',
						values: [
							{
								displayName: 'Annual Revenue',
								name: 'annualRevenue',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Country',
								name: 'country',
								type: 'string',
								default: '',
							},
							{
								displayName: 'External Values (JSON)',
								name: 'externalValues',
								type: 'json',
								default: {},
							},
							{
								displayName: 'Industry',
								name: 'industry',
								type: 'string',
								default: '',
							},
							{
								displayName: 'LinkedIn',
								name: 'linkedin',
								type: 'string',
								default: '',
							},
							{
								displayName: 'List ID',
								name: 'listId',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
							},
							{
								displayName: 'Number Of Employees',
								name: 'numberOfEmployees',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Owner',
								name: 'owner',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Phone',
								name: 'phone',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Website',
								name: 'website',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Import Type',
				name: 'companyImportType',
				type: 'options',
				default: 'IgnoreDuplicates',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				options: [
					{ name: 'Ignore Duplicates', value: 'IgnoreDuplicates' },
					{ name: 'Update Duplicates', value: 'UpdateDuplicates' },
					{
						name: 'Update Duplicates And Change Ownership',
						value: 'UpdateDuplicatesAndChangeOwnership',
					},
				],
				description: 'How to handle duplicates during import',
			},
			{
				displayName: 'File Name',
				name: 'companyImportFileName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Optional file name associated with the import',
			},
			{
				displayName: 'Enrich Company',
				name: 'companyImportEnrichCompany',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether to enrich company data during import',
			},
			{
				displayName: 'AI External Property IDs',
				name: 'companyImportAiExternalPropertyIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of AI external property IDs to generate',
			},
			{
				displayName: 'First Name',
				name: 'contactCreateFirstName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact first name',
			},
			{
				displayName: 'Last Name',
				name: 'contactCreateLastName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact last name',
			},
			{
				displayName: 'Email',
				name: 'contactCreateEmail',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact email',
			},
			{
				displayName: 'Phone',
				name: 'contactCreatePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact phone',
			},
			{
				displayName: 'Title',
				name: 'contactCreateTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact job title',
			},
			{
				displayName: 'Company',
				name: 'contactCreateCompany',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company name',
			},
			{
				displayName: 'Account ID',
				name: 'contactCreateAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Account ID to associate with the contact',
			},
			{
				displayName: 'Company Annual Revenue',
				name: 'contactCreateCompanyAnnualRevenue',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Company Country',
				name: 'contactCreateCompanyCountry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Company Industry',
				name: 'contactCreateCompanyIndustry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Company LinkedIn',
				name: 'contactCreateCompanyLinkedin',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Company LinkedIn URL',
			},
			{
				displayName: 'Company LinkedIn Numeric ID',
				name: 'contactCreateCompanyLinkedinNumericId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Company Number Of Employees',
				name: 'contactCreateCompanyNumberOfEmployees',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Company Website',
				name: 'contactCreateCompanyWebsite',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Country Code',
				name: 'contactCreateCountryCode',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Create As Lead',
				name: 'contactCreateCreateAsLead',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether to create the contact as a lead',
			},
			{
				displayName: 'Create In CRM',
				name: 'contactCreateCreateInCrm',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether to create the contact in the connected CRM',
			},
			{
				displayName: 'External Values (JSON)',
				name: 'contactCreateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'G2 Public ID',
				name: 'contactCreateG2PublicId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'LinkedIn',
				name: 'contactCreateLinkedin',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'LinkedIn URL',
			},
			{
				displayName: 'LinkedIn Lead ID',
				name: 'contactCreateLinkedinLeadId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'List ID',
				name: 'contactCreateListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'List ID to associate with the contact',
			},
			{
				displayName: 'Location',
				name: 'contactCreateLocation',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact location',
			},
			{
				displayName: 'Mobile Phone',
				name: 'contactCreateMobilePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact mobile phone',
			},
			{
				displayName: 'Strategy ID',
				name: 'contactCreateStrategyId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Strategy ID to add the contact to',
			},
			{
				displayName: 'Time Zone',
				name: 'contactCreateTimeZone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact time zone',
			},
			{
				displayName: 'User ID',
				name: 'contactCreateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Generate AI Variables (JSON)',
				name: 'contactCreateGenerateAiVariables',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Generate AI variables request payload',
			},
			{
				displayName: 'First Name',
				name: 'contactUpdateFirstName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact first name',
			},
			{
				displayName: 'Last Name',
				name: 'contactUpdateLastName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact last name',
			},
			{
				displayName: 'Email',
				name: 'contactUpdateEmail',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact email',
			},
			{
				displayName: 'Phone',
				name: 'contactUpdatePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact phone',
			},
			{
				displayName: 'Title',
				name: 'contactUpdateTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact job title',
			},
			{
				displayName: 'Location',
				name: 'contactUpdateLocation',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact location',
			},
			{
				displayName: 'LinkedIn',
				name: 'contactUpdateLinkedin',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'LinkedIn URL',
			},
			{
				displayName: 'Country Code',
				name: 'contactUpdateCountryCode',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'External Values (JSON)',
				name: 'contactUpdateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'Mobile Phone',
				name: 'contactUpdateMobilePhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact mobile phone',
			},
			{
				displayName: 'User ID',
				name: 'contactUpdateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Prospects',
				name: 'contactImportProspects',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Prospects to import',
				options: [
					{
						name: 'prospect',
						displayName: 'Prospect',
						values: [
							{
								displayName: 'Account External Values (JSON)',
								name: 'accountExternalValues',
								type: 'json',
								default: {},
							},
							{
								displayName: 'Company',
								name: 'company',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Company Annual Revenue',
								name: 'companyAnnualRevenue',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Company Country',
								name: 'companyCountry',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Company Industry',
								name: 'companyIndustry',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Company LinkedIn',
								name: 'companyLinkedin',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Company Number Of Employees',
								name: 'companyNumberOfEmployees',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Company Website',
								name: 'companyWebsite',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								default: '',
								placeholder: 'name@email.com',
							},
							{
								displayName: 'External Values (JSON)',
								name: 'externalValues',
								type: 'json',
								default: {},
							},
							{
								displayName: 'First Name',
								name: 'firstName',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Last Name',
								name: 'lastName',
								type: 'string',
								default: '',
							},
							{
								displayName: 'LinkedIn',
								name: 'linkedin',
								type: 'string',
								default: '',
							},
							{
								displayName: 'List ID',
								name: 'listId',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Location',
								name: 'location',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Mobile Phone',
								name: 'mobilePhone',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Owner',
								name: 'owner',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Phone',
								name: 'phone',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Sales Navigator URL',
								name: 'salesNavigatorUrl',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Strategy ID',
								name: 'strategyId',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Title',
								name: 'title',
								type: 'string',
								default: '',
							},
							
						],
					},
				],
			},
			{
				displayName: 'Import Type',
				name: 'contactImportType',
				type: 'options',
				default: 'IgnoreDuplicates',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				options: [
					{ name: 'Ignore Duplicates', value: 'IgnoreDuplicates' },
					{ name: 'Update Duplicates', value: 'UpdateDuplicates' },
					{
						name: 'Update Duplicates And Change Ownership',
						value: 'UpdateDuplicatesAndChangeOwnership',
					},
				],
				description: 'How to handle duplicates during import',
			},
			{
				displayName: 'File Name',
				name: 'contactImportFileName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Optional file name associated with the import',
			},
			{
				displayName: 'Find Email',
				name: 'contactImportFindEmail',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Find LinkedIn',
				name: 'contactImportFindLinkedin',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Find Phone',
				name: 'contactImportFindPhone',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Verify Email',
				name: 'contactImportVerifyEmail',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'AI External Property IDs',
				name: 'contactImportAiExternalPropertyIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['import'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of AI external property IDs to generate',
			},
			{
				displayName: 'Account ID',
				name: 'dealCreateAccountId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Account ID linked to the deal',
			},
			{
				displayName: 'Name',
				name: 'dealCreateName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal name',
			},
			{
				displayName: 'Amount',
				name: 'dealCreateAmount',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal amount',
			},
			{
				displayName: 'Stage',
				name: 'dealCreateStage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal stage',
			},
			{
				displayName: 'Pipeline',
				name: 'dealCreatePipeline',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal pipeline',
			},
			{
				displayName: 'Close Date',
				name: 'dealCreateCloseDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal close date',
			},
			{
				displayName: 'Description',
				name: 'dealCreateDescription',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal description',
			},
			{
				displayName: 'External Values (JSON)',
				name: 'dealCreateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'User ID',
				name: 'dealCreateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Account ID',
				name: 'dealUpdateAccountId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Account ID linked to the deal',
			},
			{
				displayName: 'Opportunity ID',
				name: 'dealUpdateOpportunityId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Opportunity ID to update',
			},
			{
				displayName: 'Name',
				name: 'dealUpdateName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal name',
			},
			{
				displayName: 'Amount',
				name: 'dealUpdateAmount',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal amount',
			},
			{
				displayName: 'Stage',
				name: 'dealUpdateStage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal stage',
			},
			{
				displayName: 'Close Date',
				name: 'dealUpdateCloseDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal close date',
			},
			{
				displayName: 'Is Closed',
				name: 'dealUpdateIsClosed',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the deal is closed',
			},
			{
				displayName: 'Is Won',
				name: 'dealUpdateIsWon',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the deal is won',
			},
			{
				displayName: 'Description',
				name: 'dealUpdateDescription',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Deal description',
			},
			{
				displayName: 'External Values (JSON)',
				name: 'dealUpdateExternalValues',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Custom field values keyed by external property ID',
			},
			{
				displayName: 'User ID',
				name: 'dealUpdateUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Description',
				name: 'noteCreateDescription',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Note content',
			},
			{
				displayName: 'Account ID',
				name: 'noteCreateAccountId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Account ID linked to the note',
			},
			{
				displayName: 'Opportunity ID',
				name: 'noteCreateOpportunityId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Opportunity ID linked to the note',
			},
			{
				displayName: 'Prospect IDs',
				name: 'noteCreateProspectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of prospect IDs',
			},
			{
				displayName: 'Account ID',
				name: 'taskCreateAccountId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Account ID linked to the task',
			},
			{
				displayName: 'Prospect ID',
				name: 'taskCreateProspectId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Prospect ID linked to the task',
			},
			{
				displayName: 'Type',
				name: 'taskCreateType',
				type: 'options',
				default: 'Generic',
				required: true,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				options: [
					{ name: 'Call', value: 'Call' },
					{ name: 'Email', value: 'Email' },
					{ name: 'Generic', value: 'Generic' },
					{ name: 'InMail', value: 'InMail' },
					{ name: 'LinkedIn', value: 'Linkedin' },
				],
				description: 'Task type',
			},
			{
				displayName: 'Activity Date',
				name: 'taskCreateActivityDate',
				type: 'dateTime',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Date/time of the task activity',
			},
			{
				displayName: 'Subtype',
				name: 'taskCreateSubtype',
				type: 'options',
				default: 'LinkedinInvitation',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				options: [
					{ name: 'LinkedIn Invitation', value: 'LinkedinInvitation' },
					{ name: 'LinkedIn Like Last Post', value: 'LinkedinLikeLastPost' },
					{ name: 'LinkedIn Message', value: 'LinkedinMessage' },
					{ name: 'LinkedIn Profile View', value: 'LinkedinProfileView' },
					{ name: 'LinkedIn Voice Note', value: 'LinkedinVoiceNote' },
				],
				description: 'Task subtype',
			},
			{
				displayName: 'Template ID',
				name: 'taskCreateTemplateId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Automatic',
				name: 'taskCreateAutomatic',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the task is automatic',
			},
			{
				displayName: 'Opportunity ID',
				name: 'taskCreateOpportunityId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Opportunity ID linked to the task',
			},
			{
				displayName: 'Subject',
				name: 'taskCreateSubject',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Task subject',
			},
			{
				displayName: 'Description',
				name: 'taskCreateDescription',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Task description',
			},
			{
				displayName: 'Personalized Subject',
				name: 'taskCreatePersonalizedSubject',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Personalized Content',
				name: 'taskCreatePersonalizedContent',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'taskSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of tasks to return',
			},
			{
				displayName: 'Offset',
				name: 'taskSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of tasks to skip',
			},
			{
				displayName: 'Date',
				name: 'taskSearchDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter tasks by a specific date',
			},
			{
				displayName: 'Prospect ID',
				name: 'taskSearchProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter tasks by prospect ID',
			},
			{
				displayName: 'Opportunity ID',
				name: 'taskSearchOpportunityId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter tasks by opportunity ID',
			},
			{
				displayName: 'Completed',
				name: 'taskSearchCompleted',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Type',
				name: 'taskSearchType',
				type: 'options',
				default: 'Generic',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Call', value: 'Call' },
					{ name: 'Email', value: 'Email' },
					{ name: 'Generic', value: 'Generic' },
					{ name: 'InMail', value: 'InMail' },
					{ name: 'LinkedIn', value: 'Linkedin' },
				],
				description: 'Task type',
			},
			{
				displayName: 'Subtype',
				name: 'taskSearchSubtype',
				type: 'options',
				default: 'LinkedinInvitation',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'LinkedIn Invitation', value: 'LinkedinInvitation' },
					{ name: 'LinkedIn Like Last Post', value: 'LinkedinLikeLastPost' },
					{ name: 'LinkedIn Message', value: 'LinkedinMessage' },
					{ name: 'LinkedIn Profile View', value: 'LinkedinProfileView' },
					{ name: 'LinkedIn Voice Note', value: 'LinkedinVoiceNote' },
				],
				description: 'Task subtype',
			},
			{
				displayName: 'Types',
				name: 'taskSearchTypes',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Call', value: 'Call' },
					{ name: 'Email', value: 'Email' },
					{ name: 'Generic', value: 'Generic' },
					{ name: 'InMail', value: 'InMail' },
					{ name: 'LinkedIn', value: 'Linkedin' },
				],
				description: 'Task types',
			},
			{
				displayName: 'Since',
				name: 'taskSearchSince',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Only tasks updated since this date/time',
			},
			{
				displayName: 'To',
				name: 'taskSearchTo',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Only tasks updated before this date/time',
			},
			{
				displayName: 'Automatic',
				name: 'taskSearchAutomatic',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Automation Error',
				name: 'taskSearchHasAutomationError',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Opportunity',
				name: 'taskSearchHasOpportunity',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'From CRM',
				name: 'taskSearchFromCrm',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'From Sequence',
				name: 'taskSearchFromSequence',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Account ID',
				name: 'taskSearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter by account ID',
			},
			{
				displayName: 'Prospect List ID',
				name: 'taskSearchProspectListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter by prospect list ID',
			},
			{
				displayName: 'Lead List ID',
				name: 'taskSearchLeadListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter by lead list ID',
			},
			{
				displayName: 'Account List ID',
				name: 'taskSearchAccountListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter by account list ID',
			},
			{
				displayName: 'Strategy ID',
				name: 'taskSearchStrategyId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Filter by strategy ID',
			},
			{
				displayName: 'Sort By',
				name: 'taskSearchSortBy',
				type: 'options',
				default: 'ActivityDate',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Activity Date', value: 'ActivityDate' },
					{ name: 'Activity Date Desc', value: 'ActivityDateDesc' },
					{ name: 'Created Date', value: 'CreatedDate' },
					{ name: 'Created Date Desc', value: 'CreatedDateDesc' },
					{ name: 'Step', value: 'Step' },
					{ name: 'Step Desc', value: 'StepDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Account External Properties (JSON)',
				name: 'taskSearchAccountExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account external property filters',
			},
			{
				displayName: 'Prospect External Properties (JSON)',
				name: 'taskSearchProspectExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Prospect external property filters',
			},
			{
				displayName: 'Lead External Properties (JSON)',
				name: 'taskSearchLeadExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Lead external property filters',
			},
			{
				displayName: 'Name',
				name: 'companySearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Company name',
			},
			{
				displayName: 'Industry',
				name: 'companySearchIndustry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Company industry',
			},
			{
				displayName: 'Country',
				name: 'companySearchCountry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Company country',
			},
			{
				displayName: 'User ID',
				name: 'companySearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Limit',
				name: 'companySearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'companySearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Status',
				name: 'companySearchStatus',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Call Scheduled', value: 'CallScheduled' },
					{ name: 'Customer', value: 'Customer' },
					{ name: 'Inactive', value: 'Inactive' },
					{ name: 'Nurture', value: 'Nurture' },
					{ name: 'Open Opportunity', value: 'OpenOpportunity' },
					{ name: 'Working', value: 'Working' },
				],
				description: 'Company status filters',
			},
			{
				displayName: 'External Properties (JSON)',
				name: 'companySearchExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'External property filters',
			},
			{
				displayName: 'External Property Numeric Filters (JSON)',
				name: 'companySearchExternalPropertyNumericFilters',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'External property numeric filters',
			},
			{
				displayName: 'External Property Empty IDs',
				name: 'companySearchExternalPropertyEmptyIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of external property IDs to match empty values',
			},
			{
				displayName: 'Number Of Employees Min',
				name: 'companySearchNumberOfEmployeesMin',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum number of employees',
			},
			{
				displayName: 'Number Of Employees Max',
				name: 'companySearchNumberOfEmployeesMax',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum number of employees',
			},
			{
				displayName: 'Current Solution',
				name: 'companySearchCurrentSolution',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'No User',
				name: 'companySearchNoUser',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Created Date Min',
				name: 'companySearchCreatedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum created date',
			},
			{
				displayName: 'Created Date Max',
				name: 'companySearchCreatedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum created date',
			},
			{
				displayName: 'Last Activity Date Min',
				name: 'companySearchLastActivityDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last activity date',
			},
			{
				displayName: 'Last Activity Date Max',
				name: 'companySearchLastActivityDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last activity date',
			},
			{
				displayName: 'Last Modified Date Min',
				name: 'companySearchLastModifiedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last modified date',
			},
			{
				displayName: 'Last Modified Date Max',
				name: 'companySearchLastModifiedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last modified date',
			},
			{
				displayName: 'Has Activities',
				name: 'companySearchHasActivities',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Active Tasks',
				name: 'companySearchHasActiveTasks',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Clicked Links',
				name: 'companySearchHasClickedLinks',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Emails Opened',
				name: 'companySearchHasEmailsOpened',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has LinkedIn',
				name: 'companySearchHasLinkedin',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Phone',
				name: 'companySearchHasPhone',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Replies',
				name: 'companySearchHasReplies',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Website',
				name: 'companySearchHasWebsite',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Clean Empty Name',
				name: 'companySearchCleanEmptyName',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Sort',
				name: 'companySearchSort',
				type: 'options',
				default: 'Contacts',
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Contacts', value: 'Contacts' },
					{ name: 'Contacts Desc', value: 'ContactsDesc' },
					{ name: 'Created Date', value: 'CreatedDate' },
					{ name: 'Created Date Desc', value: 'CreatedDateDesc' },
					{ name: 'Last Activity', value: 'LastActivity' },
					{ name: 'Last Activity Desc', value: 'LastActivityDesc' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Owner', value: 'Owner' },
					{ name: 'Owner Desc', value: 'OwnerDesc' },
					{ name: 'Progress', value: 'Progress' },
					{ name: 'Progress Desc', value: 'ProgressDesc' },
					{ name: 'Status', value: 'Status' },
					{ name: 'Status Desc', value: 'StatusDesc' },
					{ name: 'Tasks', value: 'Tasks' },
					{ name: 'Tasks Desc', value: 'TasksDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Include External Values (No Tags)',
				name: 'companySearchIncludeExternalValuesNoTags',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},			},
			{
				displayName: 'Include Tags',
				name: 'companySearchIncludeTags',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},			
			},
			{
				displayName: 'Include Tasks',
				name: 'companySearchIncludeTasks',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'contactSearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact name',
			},
			{
				displayName: 'Title',
				name: 'contactSearchTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact title',
			},
			{
				displayName: 'Object IDs',
				name: 'contactSearchObjectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of contact object IDs',
			},
			{
				displayName: 'User ID',
				name: 'contactSearchUserId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Limit',
				name: 'contactSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'contactSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Account External Properties (JSON)',
				name: 'contactSearchAccountExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account external property filters',
			},
			{
				displayName: 'Account External Property Empty IDs',
				name: 'contactSearchAccountExternalPropertyEmptyIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of account external property IDs to match empty values',
			},
			{
				displayName: 'Account External Property Numeric Filters (JSON)',
				name: 'contactSearchAccountExternalPropertyNumericFilters',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account external property numeric filters',
			},
			{
				displayName: 'Account ID',
				name: 'contactSearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Account Status',
				name: 'contactSearchAccountStatus',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Call Scheduled', value: 'CallScheduled' },
					{ name: 'Customer', value: 'Customer' },
					{ name: 'Inactive', value: 'Inactive' },
					{ name: 'Nurture', value: 'Nurture' },
					{ name: 'Open Opportunity', value: 'OpenOpportunity' },
					{ name: 'Working', value: 'Working' },
				],
				description: 'Account status filters',
			},
			{
				displayName: 'Actual Status',
				name: 'contactSearchActualStatus',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Bad Fit', value: 'BadFit' },
					{ name: 'Interested', value: 'Interested' },
					{ name: 'New', value: 'New' },
					{ name: 'Not Interested', value: 'NotInterested' },
					{ name: 'Opted Out', value: 'OptedOut' },
					{ name: 'Qualified', value: 'Qualified' },
				],
				description: 'Contact status filters',
			},
			{
				displayName: 'Country',
				name: 'contactSearchCountry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact country',
			},
			{
				displayName: 'Created Date Min',
				name: 'contactSearchCreatedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum created date',
			},
			{
				displayName: 'Created Date Max',
				name: 'contactSearchCreatedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum created date',
			},
			{
				displayName: 'Current Solution',
				name: 'contactSearchCurrentSolution',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'External Properties (JSON)',
				name: 'contactSearchExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'External property filters',
			},
			{
				displayName: 'External Property Empty IDs',
				name: 'contactSearchExternalPropertyEmptyIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of external property IDs to match empty values',
			},
			{
				displayName: 'External Property Numeric Filters (JSON)',
				name: 'contactSearchExternalPropertyNumericFilters',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'External property numeric filters',
			},
			{
				displayName: 'From Contact',
				name: 'contactSearchFromContact',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Active Tasks',
				name: 'contactSearchHasActiveTasks',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Activities',
				name: 'contactSearchHasActivities',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Clicked Links',
				name: 'contactSearchHasClickedLinks',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Connected Calls',
				name: 'contactSearchHasConnectedCalls',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Email',
				name: 'contactSearchHasEmail',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Emails Opened',
				name: 'contactSearchHasEmailsOpened',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has LinkedIn',
				name: 'contactSearchHasLinkedin',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Mobile Phone',
				name: 'contactSearchHasMobilePhone',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Phone',
				name: 'contactSearchHasPhone',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Has Replies',
				name: 'contactSearchHasReplies',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'In Sequence',
				name: 'contactSearchInSequence',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Industry',
				name: 'contactSearchIndustry',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact industry',
			},
			{
				displayName: 'Is Phone Valid',
				name: 'contactSearchIsPhoneValid',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Last Activity Date Min',
				name: 'contactSearchLastActivityDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last activity date',
			},
			{
				displayName: 'Last Activity Date Max',
				name: 'contactSearchLastActivityDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last activity date',
			},
			{
				displayName: 'Last Modified Date Min',
				name: 'contactSearchLastModifiedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last modified date',
			},
			{
				displayName: 'Last Modified Date Max',
				name: 'contactSearchLastModifiedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last modified date',
			},
			{
				displayName: 'Location',
				name: 'contactSearchLocation',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact location',
			},
			{
				displayName: 'No User',
				name: 'contactSearchNoUser',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Number Of Employees Min',
				name: 'contactSearchNumberOfEmployeesMin',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum number of employees',
			},
			{
				displayName: 'Number Of Employees Max',
				name: 'contactSearchNumberOfEmployeesMax',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum number of employees',
			},
			{
				displayName: 'Opted Out',
				name: 'contactSearchOptedOut',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Sort',
				name: 'contactSearchSort',
				type: 'options',
				default: 'CompanyName',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Company Name', value: 'CompanyName' },
					{ name: 'Company Name Desc', value: 'CompanyNameDesc' },
					{ name: 'Created Date', value: 'CreatedDate' },
					{ name: 'Created Date Desc', value: 'CreatedDateDesc' },
					{ name: 'Last Activity', value: 'LastActivity' },
					{ name: 'Last Activity Desc', value: 'LastActivityDesc' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Owner', value: 'Owner' },
					{ name: 'Owner Desc', value: 'OwnerDesc' },
					{ name: 'Progress', value: 'Progress' },
					{ name: 'Progress Desc', value: 'ProgressDesc' },
					{ name: 'Tasks', value: 'Tasks' },
					{ name: 'Tasks Desc', value: 'TasksDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Verification Statuses',
				name: 'contactSearchVerificationStatuses',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Accept All', value: 'accept_all' },
					{ name: 'Invalid', value: 'invalid' },
					{ name: 'Unknown', value: 'unknown' },
					{ name: 'Valid', value: 'valid' },
				],
				description: 'Verification status filters',
			},
			{
				displayName: 'Name',
				name: 'dealSearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Deal name',
			},
			{
				displayName: 'Account ID',
				name: 'dealSearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account ID linked to the deal',
			},
			{
				displayName: 'User ID',
				name: 'dealSearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Stage',
				name: 'dealSearchStage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Deal stage',
			},
			{
				displayName: 'Pipeline',
				name: 'dealSearchPipeline',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Deal pipeline',
			},
			{
				displayName: 'Object IDs',
				name: 'dealSearchObjectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of deal object IDs',
			},
			{
				displayName: 'Limit',
				name: 'dealSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'dealSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Created Date Min',
				name: 'dealSearchCreatedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum created date',
			},
			{
				displayName: 'Created Date Max',
				name: 'dealSearchCreatedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum created date',
			},
			{
				displayName: 'Last Modified Date Min',
				name: 'dealSearchLastModifiedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last modified date',
			},
			{
				displayName: 'Last Modified Date Max',
				name: 'dealSearchLastModifiedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last modified date',
			},
			{
				displayName: 'Close Date Min',
				name: 'dealSearchCloseDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum close date',
			},
			{
				displayName: 'Close Date Max',
				name: 'dealSearchCloseDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum close date',
			},
			{
				displayName: 'Is Closed',
				name: 'dealSearchIsClosed',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Is Won',
				name: 'dealSearchIsWon',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Amount Min',
				name: 'dealSearchAmountMin',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum amount',
			},
			{
				displayName: 'Amount Max',
				name: 'dealSearchAmountMax',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum amount',
			},
			{
				displayName: 'Active',
				name: 'dealSearchActive',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Year',
				name: 'dealSearchYear',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Year filter',
			},
			{
				displayName: 'External Properties (JSON)',
				name: 'dealSearchExternalProperties',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'External property filters',
			},
			{
				displayName: 'Sort',
				name: 'dealSearchSort',
				type: 'options',
				default: 'Amount',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Amount', value: 'Amount' },
					{ name: 'Amount Desc', value: 'AmountDesc' },
					{ name: 'Close Date', value: 'CloseDate' },
					{ name: 'Close Date Desc', value: 'CloseDateDesc' },
					{ name: 'Company', value: 'Company' },
					{ name: 'Company Desc', value: 'CompanyDesc' },
					{ name: 'Created Date', value: 'CreatedDate' },
					{ name: 'Created Date Desc', value: 'CreatedDateDesc' },
					{ name: 'Latest Activity', value: 'LatestActivity' },
					{ name: 'Latest Activity Desc', value: 'LatestActivityDesc' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Owner', value: 'Owner' },
					{ name: 'Owner Desc', value: 'OwnerDesc' },
					{ name: 'Pipeline', value: 'Pipeline' },
					{ name: 'Pipeline Desc', value: 'PipelineDesc' },
					{ name: 'Stage', value: 'Stage' },
					{ name: 'Stage Desc', value: 'StageDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Include Account',
				name: 'dealSearchIncludeAccount',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Description Contains',
				name: 'noteSearchDescriptionContains',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Text to match in note content',
			},
			{
				displayName: 'Account ID',
				name: 'noteSearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account ID linked to the note',
			},
			{
				displayName: 'Opportunity ID',
				name: 'noteSearchOpportunityId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Opportunity ID linked to the note',
			},
			{
				displayName: 'User ID',
				name: 'noteSearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Object IDs',
				name: 'noteSearchObjectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of note object IDs',
			},
			{
				displayName: 'Limit',
				name: 'noteSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'noteSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Created Date Min',
				name: 'noteSearchCreatedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum created date',
			},
			{
				displayName: 'Created Date Max',
				name: 'noteSearchCreatedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum created date',
			},
			{
				displayName: 'Last Modified Date Min',
				name: 'noteSearchLastModifiedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last modified date',
			},
			{
				displayName: 'Last Modified Date Max',
				name: 'noteSearchLastModifiedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last modified date',
			},
			{
				displayName: 'Active',
				name: 'noteSearchActive',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Account',
				name: 'noteSearchIncludeAccount',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Opportunity',
				name: 'noteSearchIncludeOpportunity',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Prospects',
				name: 'noteSearchIncludeProspects',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['note'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Subject',
				name: 'activitySearchSubject',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Activity subject',
			},
			{
				displayName: 'Account ID',
				name: 'activitySearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account ID linked to the activity',
			},
			{
				displayName: 'Prospect ID',
				name: 'activitySearchProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Prospect ID linked to the activity',
			},
			{
				displayName: 'Opportunity ID',
				name: 'activitySearchOpportunityId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Opportunity ID linked to the activity',
			},
			{
				displayName: 'User ID',
				name: 'activitySearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'Object ID',
				name: 'activitySearchObjectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Activity object ID',
			},
			{
				displayName: 'Limit',
				name: 'activitySearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'activitySearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Created Date Min',
				name: 'activitySearchCreatedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum created date',
			},
			{
				displayName: 'Created Date Max',
				name: 'activitySearchCreatedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum created date',
			},
			{
				displayName: 'Last Modified Date Min',
				name: 'activitySearchLastModifiedDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last modified date',
			},
			{
				displayName: 'Last Modified Date Max',
				name: 'activitySearchLastModifiedDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last modified date',
			},
			{
				displayName: 'Activity Date Min',
				name: 'activitySearchActivityDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum activity date',
			},
			{
				displayName: 'Activity Date Max',
				name: 'activitySearchActivityDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum activity date',
			},
			{
				displayName: 'First Answer Date Min',
				name: 'activitySearchFirstAnswerDatetimeMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum first answer date',
			},
			{
				displayName: 'First Answer Date Max',
				name: 'activitySearchFirstAnswerDatetimeMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum first answer date',
			},
			{
				displayName: 'First Track Date Min',
				name: 'activitySearchFirstTrackDatetimeMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum first track date',
			},
			{
				displayName: 'First Track Date Max',
				name: 'activitySearchFirstTrackDatetimeMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum first track date',
			},
			{
				displayName: 'Task Subtype',
				name: 'activitySearchTaskSubtype',
				type: 'options',
				default: 'LinkedinInvitation',
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'LinkedIn Invitation', value: 'LinkedinInvitation' },
					{ name: 'LinkedIn Like Last Post', value: 'LinkedinLikeLastPost' },
					{ name: 'LinkedIn Message', value: 'LinkedinMessage' },
					{ name: 'LinkedIn Profile View', value: 'LinkedinProfileView' },
					{ name: 'LinkedIn Voice Note', value: 'LinkedinVoiceNote' },
				],
			},
			{
				displayName: 'Crono Object ID',
				name: 'activitySearchCronoObjectId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Account',
				name: 'activitySearchIncludeAccount',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Call Log',
				name: 'activitySearchIncludeCallLog',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Email Log',
				name: 'activitySearchIncludeEmailLog',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include LinkedIn Log',
				name: 'activitySearchIncludeLinkedinLog',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Opportunity',
				name: 'activitySearchIncludeOpportunity',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Prospect',
				name: 'activitySearchIncludeProspect',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['activity'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'listSearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'List name',
			},
			{
				displayName: 'Account ID',
				name: 'listSearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account ID linked to the list',
			},
			{
				displayName: 'Prospect ID',
				name: 'listSearchProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Prospect ID linked to the list',
			},
			{
				displayName: 'Strategy ID',
				name: 'listSearchStrategyId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Strategy ID linked to the list',
			},
			{
				displayName: 'Template ID',
				name: 'listSearchTemplateId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Template ID linked to the list',
			},
			{
				displayName: 'Type',
				name: 'listSearchType',
				type: 'options',
				default: 'Account',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Account', value: 'Account' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Prospect', value: 'Prospect' },
					{ name: 'Strategy', value: 'Strategy' },
					{ name: 'Template', value: 'Template' },
				],
				description: 'List table type',
			},
			{
				displayName: 'Sort Type',
				name: 'listSearchSortType',
				type: 'options',
				default: 'Creation',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Creation', value: 'Creation' },
					{ name: 'Creation Desc', value: 'CreationDesc' },
					{ name: 'Included First', value: 'IncludedFirst' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Open Lists', value: 'OpenLists' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Limit',
				name: 'listSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'listSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Name',
				name: 'strategySearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Strategy name',
			},
			{
				displayName: 'Account ID',
				name: 'strategySearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Account ID linked to the strategy',
			},
			{
				displayName: 'Prospect ID',
				name: 'strategySearchProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Prospect ID linked to the strategy',
			},
			{
				displayName: 'User ID',
				name: 'strategySearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID',
			},
			{
				displayName: 'IDs',
				name: 'strategySearchIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of strategy IDs',
			},
			{
				displayName: 'Limit',
				name: 'strategySearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'strategySearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Sort',
				name: 'strategySearchSort',
				type: 'options',
				default: 'Created',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Created', value: 'Created' },
					{ name: 'Created Desc', value: 'CreatedDesc' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Replied', value: 'Replied' },
					{ name: 'Tags', value: 'Tags' },
					{ name: 'Usage', value: 'Usage' },
					{ name: 'Usage Desc', value: 'UsageDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Strategy Tags (JSON)',
				name: 'strategySearchTags',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Array of strategy tags',
			},
			{
				displayName: 'Include Active Sequence Instances',
				name: 'strategySearchIncludeActiveSequenceInstances',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Analytics',
				name: 'strategySearchIncludeAnalytics',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Sequence',
				name: 'strategySearchIncludeSequence',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Include Users',
				name: 'strategySearchIncludeUsers',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Strategy ID',
				name: 'strategyDetailsStrategyId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Strategy ID to retrieve details for',
			},
			{
				displayName: 'Text',
				name: 'strategyDetailsText',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Free-text filter for strategy details',
			},
			{
				displayName: 'Limit',
				name: 'strategyDetailsLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'strategyDetailsOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Sort',
				name: 'strategyDetailsSort',
				type: 'options',
				default: 'ContactsAsc',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Contacts Asc', value: 'ContactsAsc' },
					{ name: 'Contacts Desc', value: 'ContactsDesc' },
					{ name: 'Last Activity Asc', value: 'LastActivityAsc' },
					{ name: 'Last Activity Desc', value: 'LastActivityDesc' },
					{ name: 'Last Interaction Asc', value: 'LastInteractionAsc' },
					{ name: 'Last Interaction Desc', value: 'LastInteractionDesc' },
					{ name: 'Progress Asc', value: 'ProgressAsc' },
					{ name: 'Progress Desc', value: 'ProgressDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Status',
				name: 'strategyDetailsStatus',
				type: 'options',
				default: 'Active',
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Active', value: 'Active' },
					{ name: 'Answered', value: 'Answered' },
					{ name: 'Completed', value: 'Completed' },
					{ name: 'Converted', value: 'Converted' },
					{ name: 'Dead', value: 'Dead' },
					{ name: 'Stopped', value: 'Stopped' },
					{ name: 'Unknown', value: 'Unknown' },
				],
				description: 'Sequence status',
			},
			{
				displayName: 'Only Specific Task',
				name: 'strategyDetailsOnlySpecificTask',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Accepted LinkedIn Invitation', value: 'AcceptedLinkedinInvitation' },
					{ name: 'Bounced Emails', value: 'BouncedEmails' },
					{ name: 'Clicked Emails Link', value: 'ClickedEmailsLink' },
					{ name: 'Connected Calls', value: 'ConnectedCalls' },
					{ name: 'Delivered Emails', value: 'DeliveredEmails' },
					{ name: 'Not Opened Emails', value: 'NotOpenedEmails' },
					{ name: 'Opened Emails', value: 'OpenedEmails' },
					{ name: 'Replied Emails', value: 'RepliedEmails' },
					{ name: 'Replied LinkedIn Message', value: 'RepliedLinkedinMessage' },
				],
				description: 'Filter by specific task events',
			},
			{
				displayName: 'Only My Sequences',
				name: 'strategyDetailsOnlyMySequences',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Only My Prospects',
				name: 'strategyDetailsOnlyMyProspects',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['strategy'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Table Type',
				name: 'externalPropertySearchTableType',
				type: 'options',
				default: 'Account',
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Account', value: 'Account' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Opportunity', value: 'Opportunity' },
					{ name: 'Prospect', value: 'Prospect' },
				],
				description: 'External properties table type',
			},
			{
				displayName: 'Is Filter',
				name: 'externalPropertySearchIsFilter',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Is Imported',
				name: 'externalPropertySearchIsImported',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Is Status',
				name: 'externalPropertySearchIsStatus',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Only AI Variables',
				name: 'externalPropertySearchOnlyAiVariables',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Only Insert',
				name: 'externalPropertySearchOnlyInsert',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Only Tag',
				name: 'externalPropertySearchOnlyTag',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'With Lead',
				name: 'externalPropertySearchWithLead',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Email',
				name: 'userSearchEmail',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'User email',
			},
			{
				displayName: 'Active',
				name: 'userSearchActive',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether the user is active',
			},
			{
				displayName: 'Limit',
				name: 'userSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'userSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Import Type',
				name: 'importType',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['import'],
						operation: ['getAll'],
					},
				},
				options: [
					{ name: 'Account', value: 'Account' },
					{ name: 'All', value: '' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Opportunity', value: 'Opportunity' },
					{ name: 'Prospect', value: 'Prospect' },
				],
				description: 'Filter imports by table type',
			},
			{
				displayName: 'Import Status',
				name: 'importStatus',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['import'],
						operation: ['getAll'],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Completed', value: 'Completed' },
					{ name: 'Completed With Errors', value: 'CompletedWithErrors' },
					{ name: 'On Going', value: 'OnGoing' },
					{ name: 'Started', value: 'Started' },
					{ name: 'Stop Completed', value: 'StopCompleted' },
					{ name: 'Stop Request From User', value: 'StopRequestFromUser' },
				],
				description: 'Filter imports by status',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const resource = this.getNodeParameter('resource', itemIndex) as CronoResource;
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			const apiVersion = this.getNodeParameter('apiVersion', itemIndex, '1') as string;
			const basePath = `/api/v${apiVersion}`;
			const useRawJsonData = this.getNodeParameter('useRawJsonData', itemIndex, false) as boolean;
			const useRawJsonSearch = this.getNodeParameter('useRawJsonSearch', itemIndex, false) as boolean;

			let endpoint = '';
			let method: IHttpRequestMethods = 'GET';
			let qs: IDataObject = {};
			let body: IDataObject | undefined;

			if (operation === 'getAll') {
				const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
				const offset = this.getNodeParameter('offset', itemIndex, 0) as number;
				qs = { limit, offset };
			}

			switch (resource) {
				case 'company': {
					endpoint = `${basePath}/Accounts`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
						qs = getJsonParameter(this, 'includeOptions', itemIndex);
					} else if (operation === 'getAll') {
						method = 'GET';
						const includeOptions = getJsonParameter(this, 'includeOptions', itemIndex);
						qs = { ...qs, ...includeOptions };
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Name',
								this.getNodeParameter('companySearchName', itemIndex, ''),
							);
							const status = this.getNodeParameter(
								'companySearchStatus',
								itemIndex,
								[],
							) as string[];
							if (status.length) {
								searchBody.Status = status;
							}
							const externalProperties = getJsonParameter(
								this,
								'companySearchExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(externalProperties).length) {
								searchBody.ExternalProperties = externalProperties;
							}
							const externalPropertyNumericFilters = getJsonParameter(
								this,
								'companySearchExternalPropertyNumericFilters',
								itemIndex,
								{},
							);
							if (Object.keys(externalPropertyNumericFilters).length) {
								searchBody.ExternalPropertyNumericFilters = externalPropertyNumericFilters;
							}
							const externalPropertyEmptyIds = parseCsv(
								this.getNodeParameter(
									'companySearchExternalPropertyEmptyIds',
									itemIndex,
									'',
								) as string,
							);
							if (externalPropertyEmptyIds.length) {
								searchBody.ExternalPropertyEmptyIds = externalPropertyEmptyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							addIfNotEmpty(
								searchBody,
								'Industry',
								this.getNodeParameter('companySearchIndustry', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Country',
								this.getNodeParameter('companySearchCountry', itemIndex, ''),
							);
							const numberOfEmployeesMin = this.getNodeParameter(
								'companySearchNumberOfEmployeesMin',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployeesMin) {
								searchBody.NumberOfEmployeesMin = numberOfEmployeesMin;
							}
							const numberOfEmployeesMax = this.getNodeParameter(
								'companySearchNumberOfEmployeesMax',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployeesMax) {
								searchBody.NumberOfEmployeesMax = numberOfEmployeesMax;
							}
							addIfNotEmpty(
								searchBody,
								'CurrentSolution',
								this.getNodeParameter('companySearchCurrentSolution', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('companySearchUserId', itemIndex, ''),
							);
							if (this.getNodeParameter('companySearchNoUser', itemIndex, false)) {
								searchBody.NoUser = true;
							}
							addIfNotEmpty(
								searchBody,
								'CreatedDateMin',
								this.getNodeParameter('companySearchCreatedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMax',
								this.getNodeParameter('companySearchCreatedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastActivityDateMin',
								this.getNodeParameter('companySearchLastActivityDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastActivityDateMax',
								this.getNodeParameter('companySearchLastActivityDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMin',
								this.getNodeParameter('companySearchLastModifiedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMax',
								this.getNodeParameter('companySearchLastModifiedDateMax', itemIndex, ''),
							);
							if (this.getNodeParameter('companySearchHasLinkedin', itemIndex, false)) {
								searchBody.HasLinkedin = true;
							}
							if (this.getNodeParameter('companySearchHasWebsite', itemIndex, false)) {
								searchBody.HasWebsite = true;
							}
							if (this.getNodeParameter('companySearchHasPhone', itemIndex, false)) {
								searchBody.HasPhone = true;
							}
							if (this.getNodeParameter('companySearchHasActivities', itemIndex, false)) {
								searchBody.HasActivities = true;
							}
							if (this.getNodeParameter('companySearchHasReplies', itemIndex, false)) {
								searchBody.HasReplies = true;
							}
							if (this.getNodeParameter('companySearchHasActiveTasks', itemIndex, false)) {
								searchBody.HasActiveTasks = true;
							}
							if (this.getNodeParameter('companySearchHasEmailsOpened', itemIndex, false)) {
								searchBody.HasEmailsOpened = true;
							}
							if (this.getNodeParameter('companySearchHasClickedLinks', itemIndex, false)) {
								searchBody.HasClickedLinks = true;
							}
							const cleanEmptyName = this.getNodeParameter(
								'companySearchCleanEmptyName',
								itemIndex,
								true,
							) as boolean;
							searchBody.CleanEmptyName = cleanEmptyName;
							addIfNotEmpty(
								searchBody,
								'Sort',
								this.getNodeParameter('companySearchSort', itemIndex, ''),
							);
							const includes: IDataObject = {};
							if (
								this.getNodeParameter(
									'companySearchIncludeExternalValuesNoTags',
									itemIndex,
									false,
								)
							) {
								includes.WithExternalValuesNoTags = true;
							}
							if (this.getNodeParameter('companySearchIncludeTags', itemIndex, false)) {
								includes.WithTags = true;
							}
							if (this.getNodeParameter('companySearchIncludeTasks', itemIndex, false)) {
								includes.WithTasks = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Includes = includes;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('companySearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('companySearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'Name',
								this.getNodeParameter('companyCreateName', itemIndex, ''),
							);
							const numberOfEmployees = this.getNodeParameter(
								'companyCreateNumberOfEmployees',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployees) {
								data.NumberOfEmployees = numberOfEmployees;
							}
							addIfNotEmpty(
								data,
								'AnnualRevenue',
								this.getNodeParameter('companyCreateAnnualRevenue', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Website',
								this.getNodeParameter('companyCreateWebsite', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Linkedin',
								this.getNodeParameter('companyCreateLinkedin', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'LinkedinNumericId',
								this.getNodeParameter('companyCreateLinkedinNumericId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Industry',
								this.getNodeParameter('companyCreateIndustry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Country',
								this.getNodeParameter('companyCreateCountry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Phone',
								this.getNodeParameter('companyCreatePhone', itemIndex, ''),
							);
							if (this.getNodeParameter('companyCreateCreateInCrm', itemIndex, false)) {
								data.CreateInCrm = true;
							}
							const externalValues = getJsonParameter(
								this,
								'companyCreateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							addIfNotEmpty(
								data,
								'OwnerId',
								this.getNodeParameter('companyCreateOwnerId', itemIndex, ''),
							);
							const userId = this.getNodeParameter('companyCreateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							const listId = this.getNodeParameter('companyCreateListId', itemIndex, 0) as number;
							if (listId) {
								data.ListId = listId;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						const scrapeOptions = getJsonParameter(this, 'scrapeOptions', itemIndex, {});
						body = { data, ...(Object.keys(scrapeOptions).length ? { scrapeOptions } : {}) };
					} else if (operation === 'update') {
						method = 'PATCH';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'Name',
								this.getNodeParameter('companyUpdateName', itemIndex, ''),
							);
							const numberOfEmployees = this.getNodeParameter(
								'companyUpdateNumberOfEmployees',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployees) {
								data.NumberOfEmployees = numberOfEmployees;
							}
							addIfNotEmpty(
								data,
								'AnnualRevenue',
								this.getNodeParameter('companyUpdateAnnualRevenue', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Website',
								this.getNodeParameter('companyUpdateWebsite', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Linkedin',
								this.getNodeParameter('companyUpdateLinkedin', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'LinkedinNumericId',
								this.getNodeParameter('companyUpdateLinkedinNumericId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Industry',
								this.getNodeParameter('companyUpdateIndustry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Country',
								this.getNodeParameter('companyUpdateCountry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Phone',
								this.getNodeParameter('companyUpdatePhone', itemIndex, ''),
							);
							const externalValues = getJsonParameter(
								this,
								'companyUpdateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							const userId = this.getNodeParameter('companyUpdateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'import') {
						method = 'POST';
						endpoint = `${endpoint}/import`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const accountsValue = this.getNodeParameter(
								'companyImportAccounts',
								itemIndex,
								{},
							) as { account?: Array<IDataObject> };
							const accounts = (accountsValue.account ?? []).map((account) => {
								const accountData: IDataObject = {};
								addIfNotEmpty(accountData, 'Name', account.name);
								addIfNotEmpty(accountData, 'Website', account.website);
								addIfNotEmpty(accountData, 'Industry', account.industry);
								addIfNotEmpty(accountData, 'Country', account.country);
								addIfNotEmpty(accountData, 'Phone', account.phone);
								addIfNotEmpty(accountData, 'AnnualRevenue', account.annualRevenue);
								addIfNotEmpty(accountData, 'Linkedin', account.linkedin);
								const numberOfEmployees = account.numberOfEmployees as number;
								if (numberOfEmployees) {
									accountData.NumberOfEmployees = numberOfEmployees;
								}
								if (account.externalValues && Object.keys(account.externalValues).length) {
									accountData.ExternalValues = account.externalValues;
								}
								const listId = account.listId as number;
								if (listId) {
									accountData.ListId = listId;
								}
								addIfNotEmpty(accountData, 'Owner', account.owner);
								return accountData;
							});
							if (accounts.length) {
								data.Accounts = accounts;
							}
							addIfNotEmpty(
								data,
								'ImportType',
								this.getNodeParameter('companyImportType', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'FileName',
								this.getNodeParameter('companyImportFileName', itemIndex, ''),
							);
							const enrichCompany = this.getNodeParameter(
								'companyImportEnrichCompany',
								itemIndex,
								false,
							) as boolean;
							if (enrichCompany) {
								data.EnrichCompany = true;
							}
							const aiExternalPropertyIds = parseCsv(
								this.getNodeParameter('companyImportAiExternalPropertyIds', itemIndex, '') as string,
							);
							if (aiExternalPropertyIds.length) {
								data.AiExternalPropertiesIdsToGenerate = aiExternalPropertyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					}
					break;
				}
				case 'contact': {
					endpoint = `${basePath}/Prospects`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
						qs = getJsonParameter(this, 'includeOptions', itemIndex);
					} else if (operation === 'getAll') {
						method = 'GET';
						const includeOptions = getJsonParameter(this, 'includeOptions', itemIndex);
						qs = { ...qs, ...includeOptions };
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Name',
								this.getNodeParameter('contactSearchName', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Title',
								this.getNodeParameter('contactSearchTitle', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Country',
								this.getNodeParameter('contactSearchCountry', itemIndex, ''),
							);
							const objectIds = parseCsv(
								this.getNodeParameter('contactSearchObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								searchBody.ObjectIds = objectIds;
							}
							const userId = this.getNodeParameter('contactSearchUserId', itemIndex, 0) as number;
							if (userId) {
								searchBody.UserId = userId;
							}
							addIfNotEmpty(
								searchBody,
								'Industry',
								this.getNodeParameter('contactSearchIndustry', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Location',
								this.getNodeParameter('contactSearchLocation', itemIndex, ''),
							);
							const actualStatus = this.getNodeParameter(
								'contactSearchActualStatus',
								itemIndex,
								[],
							) as string[];
							if (actualStatus.length) {
								searchBody.ActualStatus = actualStatus;
							}
							const accountStatus = this.getNodeParameter(
								'contactSearchAccountStatus',
								itemIndex,
								[],
							) as string[];
							if (accountStatus.length) {
								searchBody.AccountStatus = accountStatus;
							}
							const externalProperties = getJsonParameter(
								this,
								'contactSearchExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(externalProperties).length) {
								searchBody.ExternalProperties = externalProperties;
							}
							const externalPropertyNumericFilters = getJsonParameter(
								this,
								'contactSearchExternalPropertyNumericFilters',
								itemIndex,
								{},
							);
							if (Object.keys(externalPropertyNumericFilters).length) {
								searchBody.ExternalPropertyNumericFilters = externalPropertyNumericFilters;
							}
							const externalPropertyEmptyIds = parseCsv(
								this.getNodeParameter(
									'contactSearchExternalPropertyEmptyIds',
									itemIndex,
									'',
								) as string,
							);
							if (externalPropertyEmptyIds.length) {
								searchBody.ExternalPropertyEmptyIds = externalPropertyEmptyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							const accountExternalProperties = getJsonParameter(
								this,
								'contactSearchAccountExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(accountExternalProperties).length) {
								searchBody.AccountExternalProperties = accountExternalProperties;
							}
							const accountExternalPropertyNumericFilters = getJsonParameter(
								this,
								'contactSearchAccountExternalPropertyNumericFilters',
								itemIndex,
								{},
							);
							if (Object.keys(accountExternalPropertyNumericFilters).length) {
								searchBody.AccountExternalPropertyNumericFilters =
									accountExternalPropertyNumericFilters;
							}
							const accountExternalPropertyEmptyIds = parseCsv(
								this.getNodeParameter(
									'contactSearchAccountExternalPropertyEmptyIds',
									itemIndex,
									'',
								) as string,
							);
							if (accountExternalPropertyEmptyIds.length) {
								searchBody.AccountExternalPropertyEmptyIds = accountExternalPropertyEmptyIds.map(
									(id) => parseInt(id, 10),
								);
							}
							const numberOfEmployeesMin = this.getNodeParameter(
								'contactSearchNumberOfEmployeesMin',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployeesMin) {
								searchBody.NumberOfEmployeesMin = numberOfEmployeesMin;
							}
							const numberOfEmployeesMax = this.getNodeParameter(
								'contactSearchNumberOfEmployeesMax',
								itemIndex,
								0,
							) as number;
							if (numberOfEmployeesMax) {
								searchBody.NumberOfEmployeesMax = numberOfEmployeesMax;
							}
							addIfNotEmpty(
								searchBody,
								'CurrentSolution',
								this.getNodeParameter('contactSearchCurrentSolution', itemIndex, ''),
							);
							if (this.getNodeParameter('contactSearchNoUser', itemIndex, false)) {
								searchBody.NoUser = true;
							}
							if (this.getNodeParameter('contactSearchInSequence', itemIndex, false)) {
								searchBody.InSequence = true;
							}
							addIfNotEmpty(
								searchBody,
								'AccountId',
								this.getNodeParameter('contactSearchAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMin',
								this.getNodeParameter('contactSearchCreatedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMax',
								this.getNodeParameter('contactSearchCreatedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastActivityDateMin',
								this.getNodeParameter('contactSearchLastActivityDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastActivityDateMax',
								this.getNodeParameter('contactSearchLastActivityDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMin',
								this.getNodeParameter('contactSearchLastModifiedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMax',
								this.getNodeParameter('contactSearchLastModifiedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Sort',
								this.getNodeParameter('contactSearchSort', itemIndex, ''),
							);
							if (this.getNodeParameter('contactSearchIsPhoneValid', itemIndex, false)) {
								searchBody.IsPhoneValid = true;
							}
							const verificationStatuses = this.getNodeParameter(
								'contactSearchVerificationStatuses',
								itemIndex,
								[],
							) as string[];
							if (verificationStatuses.length) {
								searchBody.VerificationStatuses = verificationStatuses;
							}
							if (this.getNodeParameter('contactSearchFromContact', itemIndex, false)) {
								searchBody.FromContact = true;
							}
							if (this.getNodeParameter('contactSearchHasLinkedin', itemIndex, false)) {
								searchBody.HasLinkedin = true;
							}
							if (this.getNodeParameter('contactSearchHasEmail', itemIndex, false)) {
								searchBody.HasEmail = true;
							}
							if (this.getNodeParameter('contactSearchHasPhone', itemIndex, false)) {
								searchBody.HasPhone = true;
							}
							if (this.getNodeParameter('contactSearchHasMobilePhone', itemIndex, false)) {
								searchBody.HasMobilePhone = true;
							}
							if (this.getNodeParameter('contactSearchHasActivities', itemIndex, false)) {
								searchBody.HasActivities = true;
							}
							if (this.getNodeParameter('contactSearchHasReplies', itemIndex, false)) {
								searchBody.HasReplies = true;
							}
							if (this.getNodeParameter('contactSearchHasEmailsOpened', itemIndex, false)) {
								searchBody.HasEmailsOpened = true;
							}
							if (this.getNodeParameter('contactSearchHasConnectedCalls', itemIndex, false)) {
								searchBody.HasConnectedCalls = true;
							}
							if (this.getNodeParameter('contactSearchHasClickedLinks', itemIndex, false)) {
								searchBody.HasClickedLinks = true;
							}
							if (this.getNodeParameter('contactSearchHasActiveTasks', itemIndex, false)) {
								searchBody.HasActiveTasks = true;
							}
							if (this.getNodeParameter('contactSearchOptedOut', itemIndex, false)) {
								searchBody.OptedOut = true;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('contactSearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('contactSearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'FirstName',
								this.getNodeParameter('contactCreateFirstName', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'LastName',
								this.getNodeParameter('contactCreateLastName', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Phone',
								this.getNodeParameter('contactCreatePhone', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'MobilePhone',
								this.getNodeParameter('contactCreateMobilePhone', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Email',
								this.getNodeParameter('contactCreateEmail', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Title',
								this.getNodeParameter('contactCreateTitle', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Location',
								this.getNodeParameter('contactCreateLocation', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Linkedin',
								this.getNodeParameter('contactCreateLinkedin', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'LinkedinLeadId',
								this.getNodeParameter('contactCreateLinkedinLeadId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'G2PublicId',
								this.getNodeParameter('contactCreateG2PublicId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Company',
								this.getNodeParameter('contactCreateCompany', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CompanyLinkedin',
								this.getNodeParameter('contactCreateCompanyLinkedin', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CompanyLinkedinNumericId',
								this.getNodeParameter('contactCreateCompanyLinkedinNumericId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CompanyWebsite',
								this.getNodeParameter('contactCreateCompanyWebsite', itemIndex, ''),
							);
							const companyNumberOfEmployees = this.getNodeParameter(
								'contactCreateCompanyNumberOfEmployees',
								itemIndex,
								0,
							) as number;
							if (companyNumberOfEmployees) {
								data.CompanyNumberOfEmployees = companyNumberOfEmployees;
							}
							addIfNotEmpty(
								data,
								'CompanyIndustry',
								this.getNodeParameter('contactCreateCompanyIndustry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CompanyCountry',
								this.getNodeParameter('contactCreateCompanyCountry', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CompanyAnnualRevenue',
								this.getNodeParameter('contactCreateCompanyAnnualRevenue', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'AccountId',
								this.getNodeParameter('contactCreateAccountId', itemIndex, ''),
							);
							if (this.getNodeParameter('contactCreateCreateAsLead', itemIndex, false)) {
								data.CreateAsLead = true;
							}
							const externalValues = getJsonParameter(
								this,
								'contactCreateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							const strategyId = this.getNodeParameter(
								'contactCreateStrategyId',
								itemIndex,
								0,
							) as number;
							if (strategyId) {
								data.StrategyId = strategyId;
							}
							const generateAiVariables = getJsonParameter(
								this,
								'contactCreateGenerateAiVariables',
								itemIndex,
								{},
							);
							if (Object.keys(generateAiVariables).length) {
								data.GenerateAiVariables = generateAiVariables;
							}
							const userId = this.getNodeParameter('contactCreateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							addIfNotEmpty(
								data,
								'CountryCode',
								this.getNodeParameter('contactCreateCountryCode', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'TimeZone',
								this.getNodeParameter('contactCreateTimeZone', itemIndex, ''),
							);
							const listId = this.getNodeParameter('contactCreateListId', itemIndex, 0) as number;
							if (listId) {
								data.ListId = listId;
							}
							if (this.getNodeParameter('contactCreateCreateInCrm', itemIndex, false)) {
								data.CreateInCrm = true;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						const scrapeOptions = getJsonParameter(this, 'scrapeOptions', itemIndex, {});
						body = { data, ...(Object.keys(scrapeOptions).length ? { scrapeOptions } : {}) };
					} else if (operation === 'update') {
						method = 'PATCH';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'FirstName',
								this.getNodeParameter('contactUpdateFirstName', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'LastName',
								this.getNodeParameter('contactUpdateLastName', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Phone',
								this.getNodeParameter('contactUpdatePhone', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'MobilePhone',
								this.getNodeParameter('contactUpdateMobilePhone', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Email',
								this.getNodeParameter('contactUpdateEmail', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Title',
								this.getNodeParameter('contactUpdateTitle', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Location',
								this.getNodeParameter('contactUpdateLocation', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Linkedin',
								this.getNodeParameter('contactUpdateLinkedin', itemIndex, ''),
							);
							const externalValues = getJsonParameter(
								this,
								'contactUpdateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							const userId = this.getNodeParameter('contactUpdateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							addIfNotEmpty(
								data,
								'CountryCode',
								this.getNodeParameter('contactUpdateCountryCode', itemIndex, ''),
							);
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'import') {
						method = 'POST';
						endpoint = `${endpoint}/import`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const prospectsValue = this.getNodeParameter(
								'contactImportProspects',
								itemIndex,
								{},
							) as { prospect?: Array<IDataObject> };
							const prospects = (prospectsValue.prospect ?? []).map((prospect) => {
								const prospectData: IDataObject = {};
								addIfNotEmpty(prospectData, 'FirstName', prospect.firstName);
								addIfNotEmpty(prospectData, 'LastName', prospect.lastName);
								addIfNotEmpty(prospectData, 'Email', prospect.email);
								addIfNotEmpty(prospectData, 'Phone', prospect.phone);
								addIfNotEmpty(prospectData, 'MobilePhone', prospect.mobilePhone);
								addIfNotEmpty(prospectData, 'Title', prospect.title);
								addIfNotEmpty(prospectData, 'Location', prospect.location);
								addIfNotEmpty(prospectData, 'Linkedin', prospect.linkedin);
								addIfNotEmpty(prospectData, 'Company', prospect.company);
								addIfNotEmpty(prospectData, 'CompanyWebsite', prospect.companyWebsite);
								addIfNotEmpty(prospectData, 'CompanyLinkedin', prospect.companyLinkedin);
								addIfNotEmpty(prospectData, 'CompanyCountry', prospect.companyCountry);
								addIfNotEmpty(prospectData, 'CompanyIndustry', prospect.companyIndustry);
								addIfNotEmpty(prospectData, 'CompanyAnnualRevenue', prospect.companyAnnualRevenue);
								const companyNumberOfEmployees = prospect.companyNumberOfEmployees as number;
								if (companyNumberOfEmployees) {
									prospectData.CompanyNumberOfEmployees = companyNumberOfEmployees;
								}
								if (prospect.externalValues && Object.keys(prospect.externalValues).length) {
									prospectData.ExternalValues = prospect.externalValues;
								}
								if (
									prospect.accountExternalValues &&
									Object.keys(prospect.accountExternalValues).length
								) {
									prospectData.AccountExternalValues = prospect.accountExternalValues;
								}
								addIfNotEmpty(prospectData, 'Owner', prospect.owner);
								addIfNotEmpty(prospectData, 'SalesNavigatorUrl', prospect.salesNavigatorUrl);
								const listId = prospect.listId as number;
								if (listId) {
									prospectData.ListId = listId;
								}
								const strategyId = prospect.strategyId as number;
								if (strategyId) {
									prospectData.StrategyId = strategyId;
								}
								return prospectData;
							});
							if (prospects.length) {
								data.Prospects = prospects;
							}
							addIfNotEmpty(
								data,
								'ImportType',
								this.getNodeParameter('contactImportType', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'FileName',
								this.getNodeParameter('contactImportFileName', itemIndex, ''),
							);
							if (this.getNodeParameter('contactImportFindEmail', itemIndex, false)) {
								data.FindEmail = true;
							}
							if (this.getNodeParameter('contactImportFindLinkedin', itemIndex, false)) {
								data.FindLinkedin = true;
							}
							if (this.getNodeParameter('contactImportFindPhone', itemIndex, false)) {
								data.FindPhone = true;
							}
							if (this.getNodeParameter('contactImportVerifyEmail', itemIndex, false)) {
								data.VerifyEmail = true;
							}
							const aiExternalPropertyIds = parseCsv(
								this.getNodeParameter('contactImportAiExternalPropertyIds', itemIndex, '') as string,
							);
							if (aiExternalPropertyIds.length) {
								data.AiExternalPropertiesIdsToGenerate = aiExternalPropertyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					}
					break;
				}
				case 'deal': {
					endpoint = `${basePath}/Opportunities`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
						qs = getJsonParameter(this, 'includeOptions', itemIndex);
					} else if (operation === 'getAll') {
						method = 'GET';
						const includeOptions = getJsonParameter(this, 'includeOptions', itemIndex);
						qs = { ...qs, ...includeOptions };
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Name',
								this.getNodeParameter('dealSearchName', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'AccountId',
								this.getNodeParameter('dealSearchAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('dealSearchUserId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Stage',
								this.getNodeParameter('dealSearchStage', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Pipeline',
								this.getNodeParameter('dealSearchPipeline', itemIndex, ''),
							);
							const objectIds = parseCsv(
								this.getNodeParameter('dealSearchObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								searchBody.ObjectIds = objectIds;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('dealSearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('dealSearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							addIfNotEmpty(
								searchBody,
								'CreatedDateMin',
								this.getNodeParameter('dealSearchCreatedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMax',
								this.getNodeParameter('dealSearchCreatedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMin',
								this.getNodeParameter('dealSearchLastModifiedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMax',
								this.getNodeParameter('dealSearchLastModifiedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CloseDateMin',
								this.getNodeParameter('dealSearchCloseDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CloseDateMax',
								this.getNodeParameter('dealSearchCloseDateMax', itemIndex, ''),
							);
							if (this.getNodeParameter('dealSearchIsWon', itemIndex, false)) {
								searchBody.IsWon = true;
							}
							if (this.getNodeParameter('dealSearchIsClosed', itemIndex, false)) {
								searchBody.IsClosed = true;
							}
							const amountMin = this.getNodeParameter('dealSearchAmountMin', itemIndex, 0) as number;
							if (amountMin) {
								searchBody.AmountMin = amountMin;
							}
							const amountMax = this.getNodeParameter('dealSearchAmountMax', itemIndex, 0) as number;
							if (amountMax) {
								searchBody.AmountMax = amountMax;
							}
							if (this.getNodeParameter('dealSearchActive', itemIndex, false)) {
								searchBody.Active = true;
							}
							const year = this.getNodeParameter('dealSearchYear', itemIndex, 0) as number;
							if (year) {
								searchBody.Year = year;
							}
							const externalProperties = getJsonParameter(
								this,
								'dealSearchExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(externalProperties).length) {
								searchBody.ExternalProperties = externalProperties;
							}
							addIfNotEmpty(
								searchBody,
								'Sort',
								this.getNodeParameter('dealSearchSort', itemIndex, ''),
							);
							const includes: IDataObject = {};
							if (this.getNodeParameter('dealSearchIncludeAccount', itemIndex, false)) {
								includes.WithAccount = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Includes = includes;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'AccountId',
								this.getNodeParameter('dealCreateAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Name',
								this.getNodeParameter('dealCreateName', itemIndex, ''),
							);
							const amount = this.getNodeParameter('dealCreateAmount', itemIndex, 0) as number;
							if (amount) {
								data.Amount = amount;
							}
							addIfNotEmpty(
								data,
								'Stage',
								this.getNodeParameter('dealCreateStage', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Pipeline',
								this.getNodeParameter('dealCreatePipeline', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CloseDate',
								this.getNodeParameter('dealCreateCloseDate', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Description',
								this.getNodeParameter('dealCreateDescription', itemIndex, ''),
							);
							const externalValues = getJsonParameter(
								this,
								'dealCreateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							const userId = this.getNodeParameter('dealCreateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'update') {
						method = 'PATCH';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'AccountId',
								this.getNodeParameter('dealUpdateAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'OpportunityId',
								this.getNodeParameter('dealUpdateOpportunityId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Name',
								this.getNodeParameter('dealUpdateName', itemIndex, ''),
							);
							const amount = this.getNodeParameter('dealUpdateAmount', itemIndex, 0) as number;
							if (amount) {
								data.Amount = amount;
							}
							addIfNotEmpty(
								data,
								'Stage',
								this.getNodeParameter('dealUpdateStage', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'CloseDate',
								this.getNodeParameter('dealUpdateCloseDate', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Description',
								this.getNodeParameter('dealUpdateDescription', itemIndex, ''),
							);
							if (this.getNodeParameter('dealUpdateIsClosed', itemIndex, false)) {
								data.IsClosed = true;
							}
							if (this.getNodeParameter('dealUpdateIsWon', itemIndex, false)) {
								data.IsWon = true;
							}
							const externalValues = getJsonParameter(
								this,
								'dealUpdateExternalValues',
								itemIndex,
								{},
							);
							if (Object.keys(externalValues).length) {
								data.ExternalValues = externalValues;
							}
							const userId = this.getNodeParameter('dealUpdateUserId', itemIndex, 0) as number;
							if (userId) {
								data.UserId = userId;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					}
					break;
				}
				case 'note': {
					endpoint = `${basePath}/Notes`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
						qs = getJsonParameter(this, 'includeOptions', itemIndex);
					} else if (operation === 'getAll') {
						method = 'GET';
						const includeOptions = getJsonParameter(this, 'includeOptions', itemIndex);
						qs = { ...qs, ...includeOptions };
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'DescriptionContains',
								this.getNodeParameter('noteSearchDescriptionContains', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'AccountId',
								this.getNodeParameter('noteSearchAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'OpportunityId',
								this.getNodeParameter('noteSearchOpportunityId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('noteSearchUserId', itemIndex, ''),
							);
							const objectIds = parseCsv(
								this.getNodeParameter('noteSearchObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								searchBody.ObjectIds = objectIds;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('noteSearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('noteSearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							addIfNotEmpty(
								searchBody,
								'CreatedDateMin',
								this.getNodeParameter('noteSearchCreatedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMax',
								this.getNodeParameter('noteSearchCreatedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMin',
								this.getNodeParameter('noteSearchLastModifiedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMax',
								this.getNodeParameter('noteSearchLastModifiedDateMax', itemIndex, ''),
							);
							if (this.getNodeParameter('noteSearchActive', itemIndex, false)) {
								searchBody.Active = true;
							}
							const includes: IDataObject = {};
							if (this.getNodeParameter('noteSearchIncludeAccount', itemIndex, false)) {
								includes.WithAccount = true;
							}
							if (this.getNodeParameter('noteSearchIncludeOpportunity', itemIndex, false)) {
								includes.WithOpportunity = true;
							}
							if (this.getNodeParameter('noteSearchIncludeProspects', itemIndex, false)) {
								includes.WithProspects = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Includes = includes;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'Description',
								this.getNodeParameter('noteCreateDescription', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'AccountId',
								this.getNodeParameter('noteCreateAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'OpportunityId',
								this.getNodeParameter('noteCreateOpportunityId', itemIndex, ''),
							);
							const prospectIds = parseCsv(
								this.getNodeParameter('noteCreateProspectIds', itemIndex, '') as string,
							);
							if (prospectIds.length) {
								data.ProspectIds = prospectIds;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					}
					break;
				}
				case 'task': {
					endpoint = `${basePath}/Tasks`;
					if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						const withOpportunities = this.getNodeParameter(
							'withOpportunities',
							itemIndex,
							false,
						) as boolean;
						qs = withOpportunities ? { withOpportunities } : {};
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							const limit = this.getNodeParameter('taskSearchLimit', itemIndex, 50) as number;
							const offset = this.getNodeParameter('taskSearchOffset', itemIndex, 0) as number;
							searchBody.Limit = limit;
							searchBody.Offset = offset;
							addIfNotEmpty(
								searchBody,
								'Date',
								this.getNodeParameter('taskSearchDate', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'ProspectId',
								this.getNodeParameter('taskSearchProspectId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'OpportunityId',
								this.getNodeParameter('taskSearchOpportunityId', itemIndex, ''),
							);
							if (this.getNodeParameter('taskSearchCompleted', itemIndex, false)) {
								searchBody.Completed = true;
							}
							addIfNotEmpty(
								searchBody,
								'Type',
								this.getNodeParameter('taskSearchType', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Subtype',
								this.getNodeParameter('taskSearchSubtype', itemIndex, ''),
							);
							const types = this.getNodeParameter('taskSearchTypes', itemIndex, []) as string[];
							if (types.length) {
								searchBody.Types = types;
							}
							addIfNotEmpty(
								searchBody,
								'Since',
								this.getNodeParameter('taskSearchSince', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'To',
								this.getNodeParameter('taskSearchTo', itemIndex, ''),
							);
							if (this.getNodeParameter('taskSearchAutomatic', itemIndex, false)) {
								searchBody.Automatic = true;
							}
							if (this.getNodeParameter('taskSearchHasAutomationError', itemIndex, false)) {
								searchBody.HasAutomationError = true;
							}
							if (this.getNodeParameter('taskSearchHasOpportunity', itemIndex, false)) {
								searchBody.HasOpportunity = true;
							}
							if (this.getNodeParameter('taskSearchFromSequence', itemIndex, false)) {
								searchBody.FromSequence = true;
							}
							if (this.getNodeParameter('taskSearchFromCrm', itemIndex, false)) {
								searchBody.FromCrm = true;
							}
							addIfNotEmpty(
								searchBody,
								'AccountId',
								this.getNodeParameter('taskSearchAccountId', itemIndex, ''),
							);
							const prospectListId = this.getNodeParameter(
								'taskSearchProspectListId',
								itemIndex,
								0,
							) as number;
							if (prospectListId) {
								searchBody.ProspectListId = prospectListId;
							}
							const leadListId = this.getNodeParameter(
								'taskSearchLeadListId',
								itemIndex,
								0,
							) as number;
							if (leadListId) {
								searchBody.LeadListId = leadListId;
							}
							const accountListId = this.getNodeParameter(
								'taskSearchAccountListId',
								itemIndex,
								0,
							) as number;
							if (accountListId) {
								searchBody.AccountListId = accountListId;
							}
							const strategyId = this.getNodeParameter(
								'taskSearchStrategyId',
								itemIndex,
								0,
							) as number;
							if (strategyId) {
								searchBody.StrategyId = strategyId;
							}
							addIfNotEmpty(
								searchBody,
								'SortBy',
								this.getNodeParameter('taskSearchSortBy', itemIndex, ''),
							);
							const accountExternalProperties = getJsonParameter(
								this,
								'taskSearchAccountExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(accountExternalProperties).length) {
								searchBody.AccountExternalProperties = accountExternalProperties;
							}
							const prospectExternalProperties = getJsonParameter(
								this,
								'taskSearchProspectExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(prospectExternalProperties).length) {
								searchBody.ProspectExternalProperties = prospectExternalProperties;
							}
							const leadExternalProperties = getJsonParameter(
								this,
								'taskSearchLeadExternalProperties',
								itemIndex,
								{},
							);
							if (Object.keys(leadExternalProperties).length) {
								searchBody.LeadExternalProperties = leadExternalProperties;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'AccountId',
								this.getNodeParameter('taskCreateAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'ProspectId',
								this.getNodeParameter('taskCreateProspectId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Type',
								this.getNodeParameter('taskCreateType', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Subtype',
								this.getNodeParameter('taskCreateSubtype', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'ActivityDate',
								this.getNodeParameter('taskCreateActivityDate', itemIndex, ''),
							);
							const templateId = this.getNodeParameter('taskCreateTemplateId', itemIndex, 0) as number;
							if (templateId) {
								data.TemplateId = templateId;
							}
							if (this.getNodeParameter('taskCreateAutomatic', itemIndex, false)) {
								data.Automatic = true;
							}
							addIfNotEmpty(
								data,
								'OpportunityId',
								this.getNodeParameter('taskCreateOpportunityId', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Subject',
								this.getNodeParameter('taskCreateSubject', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'Description',
								this.getNodeParameter('taskCreateDescription', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'PersonalizedSubject',
								this.getNodeParameter('taskCreatePersonalizedSubject', itemIndex, ''),
							);
							addIfNotEmpty(
								data,
								'PersonalizedContent',
								this.getNodeParameter('taskCreatePersonalizedContent', itemIndex, ''),
							);
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					}
					break;
				}
				case 'activity': {
					endpoint = `${basePath}/Activities`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
						qs = getJsonParameter(this, 'includeOptions', itemIndex);
					} else if (operation === 'getAll') {
						method = 'GET';
						const includeOptions = getJsonParameter(this, 'includeOptions', itemIndex);
						qs = { ...qs, ...includeOptions };
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Subject',
								this.getNodeParameter('activitySearchSubject', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'AccountId',
								this.getNodeParameter('activitySearchAccountId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'ProspectId',
								this.getNodeParameter('activitySearchProspectId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'OpportunityId',
								this.getNodeParameter('activitySearchOpportunityId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('activitySearchUserId', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'ObjectId',
								this.getNodeParameter('activitySearchObjectId', itemIndex, ''),
							);
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('activitySearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('activitySearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							addIfNotEmpty(
								searchBody,
								'CreatedDateMin',
								this.getNodeParameter('activitySearchCreatedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'CreatedDateMax',
								this.getNodeParameter('activitySearchCreatedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMin',
								this.getNodeParameter('activitySearchLastModifiedDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastModifiedDateMax',
								this.getNodeParameter('activitySearchLastModifiedDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'ActivityDateMin',
								this.getNodeParameter('activitySearchActivityDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'ActivityDateMax',
								this.getNodeParameter('activitySearchActivityDateMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'FirstAnswerDatetimeMin',
								this.getNodeParameter('activitySearchFirstAnswerDatetimeMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'FirstAnswerDatetimeMax',
								this.getNodeParameter('activitySearchFirstAnswerDatetimeMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'FirstTrackDatetimeMin',
								this.getNodeParameter('activitySearchFirstTrackDatetimeMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'FirstTrackDatetimeMax',
								this.getNodeParameter('activitySearchFirstTrackDatetimeMax', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'TaskSubtype',
								this.getNodeParameter('activitySearchTaskSubtype', itemIndex, ''),
							);
							const cronoObjectId = this.getNodeParameter(
								'activitySearchCronoObjectId',
								itemIndex,
								0,
							) as number;
							if (cronoObjectId) {
								searchBody.CronoObjectId = cronoObjectId;
							}
							const includes: IDataObject = {};
							if (this.getNodeParameter('activitySearchIncludeAccount', itemIndex, false)) {
								includes.WithAccount = true;
							}
							if (this.getNodeParameter('activitySearchIncludeProspect', itemIndex, false)) {
								includes.WithProspect = true;
							}
							if (this.getNodeParameter('activitySearchIncludeEmailLog', itemIndex, false)) {
								includes.WithEmailLog = true;
							}
							if (this.getNodeParameter('activitySearchIncludeCallLog', itemIndex, false)) {
								includes.WithCallLog = true;
							}
							if (this.getNodeParameter('activitySearchIncludeLinkedinLog', itemIndex, false)) {
								includes.WithLinkedinLog = true;
							}
							if (this.getNodeParameter('activitySearchIncludeOpportunity', itemIndex, false)) {
								includes.WithOpportunity = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Include = includes;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					}
					break;
				}
				case 'list': {
					method = 'POST';
					endpoint = `${basePath}/CronoLists/search`;
					if (useRawJsonSearch) {
						body = getJsonParameter(this, 'search', itemIndex);
					} else {
						const searchBody: IDataObject = {};
						addIfNotEmpty(
							searchBody,
							'Name',
							this.getNodeParameter('listSearchName', itemIndex, ''),
						);
						addIfNotEmpty(
							searchBody,
							'AccountId',
							this.getNodeParameter('listSearchAccountId', itemIndex, ''),
						);
						addIfNotEmpty(
							searchBody,
							'ProspectId',
							this.getNodeParameter('listSearchProspectId', itemIndex, ''),
						);
						const strategyId = this.getNodeParameter('listSearchStrategyId', itemIndex, 0) as number;
						if (strategyId) {
							searchBody.StrategyId = strategyId;
						}
						const templateId = this.getNodeParameter('listSearchTemplateId', itemIndex, 0) as number;
						if (templateId) {
							searchBody.TemplateId = templateId;
						}
						const pagination: IDataObject = {};
						addIfNotEmpty(
							pagination,
							'Limit',
							this.getNodeParameter('listSearchLimit', itemIndex, 50),
						);
						addIfNotEmpty(
							pagination,
							'Offset',
							this.getNodeParameter('listSearchOffset', itemIndex, 0),
						);
						if (Object.keys(pagination).length) {
							searchBody.Pagination = pagination;
						}
						addIfNotEmpty(
							searchBody,
							'Type',
							this.getNodeParameter('listSearchType', itemIndex, 'Account'),
						);
						addIfNotEmpty(
							searchBody,
							'SortType',
							this.getNodeParameter('listSearchSortType', itemIndex, ''),
						);
						Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
						body = searchBody;
					}
					break;
				}
				case 'pipeline': {
					method = 'GET';
					endpoint = `${basePath}/Pipelines`;
					break;
				}
				case 'strategy': {
					method = 'POST';
					endpoint = `${basePath}/Strategies/${operation === 'searchDetails' ? 'details' : 'search'}`;
					if (useRawJsonSearch) {
						body = getJsonParameter(this, 'search', itemIndex);
					} else if (operation === 'searchDetails') {
						const searchBody: IDataObject = {};
						const strategyId = this.getNodeParameter(
							'strategyDetailsStrategyId',
							itemIndex,
							0,
						) as number;
						searchBody.StrategyId = strategyId;
						addIfNotEmpty(
							searchBody,
							'Text',
							this.getNodeParameter('strategyDetailsText', itemIndex, ''),
						);
						const pagination: IDataObject = {};
						addIfNotEmpty(
							pagination,
							'Limit',
							this.getNodeParameter('strategyDetailsLimit', itemIndex, 50),
						);
						addIfNotEmpty(
							pagination,
							'Offset',
							this.getNodeParameter('strategyDetailsOffset', itemIndex, 0),
						);
						if (Object.keys(pagination).length) {
							searchBody.Pagination = pagination;
						}
						addIfNotEmpty(
							searchBody,
							'Sort',
							this.getNodeParameter('strategyDetailsSort', itemIndex, 'ContactsAsc'),
						);
						addIfNotEmpty(
							searchBody,
							'Status',
							this.getNodeParameter('strategyDetailsStatus', itemIndex, ''),
						);
						const onlySpecificTask = this.getNodeParameter(
							'strategyDetailsOnlySpecificTask',
							itemIndex,
							[],
						) as string[];
						if (onlySpecificTask.length) {
							searchBody.OnlySpecificTask = onlySpecificTask;
						}
						if (this.getNodeParameter('strategyDetailsOnlyMySequences', itemIndex, false)) {
							searchBody.OnlyMySequences = true;
						}
						if (this.getNodeParameter('strategyDetailsOnlyMyProspects', itemIndex, false)) {
							searchBody.OnlyMyProspects = true;
						}
						Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
						body = searchBody;
					} else {
						const searchBody: IDataObject = {};
						addIfNotEmpty(
							searchBody,
							'Name',
							this.getNodeParameter('strategySearchName', itemIndex, ''),
						);
						addIfNotEmpty(
							searchBody,
							'AccountId',
							this.getNodeParameter('strategySearchAccountId', itemIndex, ''),
						);
						addIfNotEmpty(
							searchBody,
							'ProspectId',
							this.getNodeParameter('strategySearchProspectId', itemIndex, ''),
						);
						addIfNotEmpty(
							searchBody,
							'UserId',
							this.getNodeParameter('strategySearchUserId', itemIndex, ''),
						);
						const ids = parseCsv(
							this.getNodeParameter('strategySearchIds', itemIndex, '') as string,
						);
						if (ids.length) {
							searchBody.Ids = ids;
						}
						const pagination: IDataObject = {};
						addIfNotEmpty(
							pagination,
							'Limit',
							this.getNodeParameter('strategySearchLimit', itemIndex, 50),
						);
						addIfNotEmpty(
							pagination,
							'Offset',
							this.getNodeParameter('strategySearchOffset', itemIndex, 0),
						);
						if (Object.keys(pagination).length) {
							searchBody.Pagination = pagination;
						}
						addIfNotEmpty(
							searchBody,
							'Sort',
							this.getNodeParameter('strategySearchSort', itemIndex, ''),
						);
						const strategyTags = getJsonParameter(
							this,
							'strategySearchTags',
							itemIndex,
							{},
						);
						if (Object.keys(strategyTags).length) {
							searchBody.StrategyTags = strategyTags;
						}
						const includeOptions: IDataObject = {};
						if (
							this.getNodeParameter(
								'strategySearchIncludeActiveSequenceInstances',
								itemIndex,
								false,
							)
						) {
							includeOptions.WithActiveSequenceInstances = true;
						}
						if (this.getNodeParameter('strategySearchIncludeAnalytics', itemIndex, false)) {
							includeOptions.WithAnalytics = true;
						}
						if (this.getNodeParameter('strategySearchIncludeSequence', itemIndex, false)) {
							includeOptions.WithSequence = true;
						}
						if (this.getNodeParameter('strategySearchIncludeUsers', itemIndex, false)) {
							includeOptions.WithUsers = true;
						}
						if (Object.keys(includeOptions).length) {
							searchBody.IncludeOptions = includeOptions;
						}
						Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
						body = searchBody;
					}
					break;
				}
				case 'externalProperty': {
					method = 'POST';
					endpoint = `${basePath}/ExternalProperties/search`;
					if (useRawJsonSearch) {
						body = getJsonParameter(this, 'search', itemIndex);
					} else {
						const searchBody: IDataObject = {};
						addIfNotEmpty(
							searchBody,
							'TableType',
							this.getNodeParameter('externalPropertySearchTableType', itemIndex, ''),
						);
						if (this.getNodeParameter('externalPropertySearchOnlyInsert', itemIndex, false)) {
							searchBody.OnlyInsert = true;
						}
						if (this.getNodeParameter('externalPropertySearchOnlyTag', itemIndex, false)) {
							searchBody.OnlyTag = true;
						}
						if (this.getNodeParameter('externalPropertySearchWithLead', itemIndex, false)) {
							searchBody.WithLead = true;
						}
						if (this.getNodeParameter('externalPropertySearchIsImported', itemIndex, false)) {
							searchBody.IsImported = true;
						}
						if (this.getNodeParameter('externalPropertySearchIsStatus', itemIndex, false)) {
							searchBody.IsStatus = true;
						}
						if (this.getNodeParameter('externalPropertySearchIsFilter', itemIndex, false)) {
							searchBody.IsFilter = true;
						}
						if (this.getNodeParameter('externalPropertySearchOnlyAiVariables', itemIndex, false)) {
							searchBody.OnlyAiVariables = true;
						}
						Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
						body = searchBody;
					}
					break;
				}
				case 'user': {
					endpoint = `${basePath}/Users`;
					if (operation === 'get') {
						method = 'GET';
						const userId = this.getNodeParameter('userId', itemIndex) as string;
						endpoint = `${endpoint}/${userId}`;
					} else if (operation === 'getAll') {
						method = 'GET';
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Email',
								this.getNodeParameter('userSearchEmail', itemIndex, ''),
							);
							if (this.getNodeParameter('userSearchActive', itemIndex, false)) {
								searchBody.Active = true;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('userSearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('userSearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							Object.assign(searchBody, getAdditionalFields(this, 'searchAdditionalFields', itemIndex));
							body = searchBody;
						}
					}
					break;
				}
				case 'import': {
					endpoint = `${basePath}/Import`;
					if (operation === 'get') {
						method = 'GET';
						const importId = this.getNodeParameter('importId', itemIndex) as number;
						endpoint = `${endpoint}/${importId}`;
					} else if (operation === 'getAll') {
						method = 'GET';
						const importType = this.getNodeParameter('importType', itemIndex) as string;
						const importStatus = this.getNodeParameter('importStatus', itemIndex) as string;
						if (importType) {
							qs.type = importType;
						}
						if (importStatus) {
							qs.statusType = importStatus;
						}
					}
					break;
				}
				default:
					throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
						itemIndex,
					});
			}

			const responseData = await cronoApiRequest.call(this, method, endpoint, qs, body);
			returnData.push({ json: responseData, pairedItem: { item: itemIndex } });
		}

		return [returnData];
	}
}
