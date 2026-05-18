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
	| 'sequence'
	| 'template'
	| 'externalProperty'
	| 'user'
	| 'import'
	| 'sync';

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

function getJsonArrayParameter(
	executeFunctions: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
	defaultValue: IDataObject[] = [],
): IDataObject[] {
	const value = executeFunctions.getNodeParameter(parameterName, itemIndex, defaultValue);

	if (value === '' || value === undefined || value === null) {
		return defaultValue;
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed as IDataObject[];
			}
		} catch (error) {
			throw new NodeOperationError(executeFunctions.getNode(), error as Error, {
				message: `Parameter "${parameterName}" is not valid JSON.`,
				itemIndex,
			});
		}
	}

	if (Array.isArray(value)) {
		return value as IDataObject[];
	}

	throw new NodeOperationError(executeFunctions.getNode(), `Parameter "${parameterName}" must be a JSON array.`, {
		itemIndex,
	});
}

type AdditionalFieldEntry = {
	field?: string;
	value?: string;
};

type PaginationConfig =
	| {
			type: 'query';
			limit: number;
			offset: number;
			limitKey: 'limit' | 'Limit';
			offsetKey: 'offset' | 'Offset';
	  }
	| {
			type: 'body';
			limit: number;
			offset: number;
	  }
	| {
			type: 'bodyPagination';
			limit: number;
			offset: number;
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
	const rawValue = executeFunctions.getNodeParameter(parameterName, itemIndex, {}) as
		| AdditionalFieldEntry[]
		| IDataObject;
	const additional: IDataObject = {};
	const entries = Array.isArray(rawValue)
		? rawValue
		: ((Object.values(rawValue).find((value) => Array.isArray(value)) as
				| AdditionalFieldEntry[]
				| undefined) ?? []);

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

function cloneDataObject<T>(value: T): T {
	if (value === undefined) {
		return value;
	}

	return JSON.parse(JSON.stringify(value)) as T;
}

function getPaginationConfig(qs: IDataObject, body?: IDataObject): PaginationConfig | undefined {
	const queryLimitKey = typeof qs.Limit === 'number' ? 'Limit' : 'limit';
	const queryOffsetKey = typeof qs.Offset === 'number' ? 'Offset' : 'offset';
	const queryLimit = qs[queryLimitKey];
	const queryOffset = qs[queryOffsetKey];

	if (typeof queryLimit === 'number' && typeof queryOffset === 'number') {
		return {
			type: 'query',
			limit: queryLimit,
			offset: queryOffset,
			limitKey: queryLimitKey,
			offsetKey: queryOffsetKey,
		};
	}

	if (!body) {
		return undefined;
	}

	const bodyLimit = body.Limit;
	const bodyOffset = body.Offset;
	if (typeof bodyLimit === 'number' && typeof bodyOffset === 'number') {
		return {
			type: 'body',
			limit: bodyLimit,
			offset: bodyOffset,
		};
	}

	const pagination = body.Pagination as IDataObject | undefined;
	if (pagination && typeof pagination.Limit === 'number' && typeof pagination.Offset === 'number') {
		return {
			type: 'bodyPagination',
			limit: pagination.Limit,
			offset: pagination.Offset,
		};
	}

	return undefined;
}

function setPaginationOffset(
	qs: IDataObject,
	body: IDataObject | undefined,
	pagination: PaginationConfig,
	offset: number,
): void {
	if (pagination.type === 'query') {
		const offsetKey =
			pagination.offsetKey in qs ? pagination.offsetKey : 'Offset' in qs ? 'Offset' : 'offset';
		qs[offsetKey] = offset;
		return;
	}

	if (!body) {
		return;
	}

	if (pagination.type === 'body') {
		body.Offset = offset;
		return;
	}

	const currentPagination = body.Pagination as IDataObject | undefined;
	if (currentPagination) {
		currentPagination.Offset = offset;
	}
}

function extractItemsFromResponse(responseData: unknown): IDataObject[] | null {
	if (Array.isArray(responseData)) {
		const items = responseData.filter(
			(item): item is IDataObject =>
				item !== null && typeof item === 'object' && !Array.isArray(item),
		);
		return items.length > 0 ? items : null;
	}

	if (!responseData || typeof responseData !== 'object') {
		return null;
	}

	const preferredKeys = [
		'Accounts',
		'Prospects',
		'Opportunities',
		'Notes',
		'Activities',
		'Users',
		'Imports',
		'CronoLists',
		'Strategies',
		'Sequences',
		'Templates',
		'Tasks',
		'Results',
		'Items',
		'Data',
	];

	const responseObject = responseData as IDataObject;
	for (const key of preferredKeys) {
		const value = responseObject[key];
		if (Array.isArray(value)) {
			const items = value.filter(
				(item): item is IDataObject =>
					item !== null && typeof item === 'object' && !Array.isArray(item),
			);
			if (items.length > 0) {
				return items;
			}
		}
	}

	for (const value of Object.values(responseObject)) {
		if (Array.isArray(value)) {
			const items = value.filter(
				(item): item is IDataObject =>
					item !== null && typeof item === 'object' && !Array.isArray(item),
			);
			if (items.length > 0) {
				return items;
			}
		}

		if (value && typeof value === 'object') {
			const nestedItems = extractItemsFromResponse(value);
			if (nestedItems && nestedItems.length > 0) {
				return nestedItems;
			}
		}
	}

	return null;
}

function getTotalCount(responseData: unknown): number | undefined {
	if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
		return undefined;
	}

	const responseObject = responseData as IDataObject;
	const preferredKeys = ['TotalCount', 'Total', 'Count'];
	for (const key of preferredKeys) {
		const value = responseObject[key];
		if (typeof value === 'number') {
			return value;
		}
	}

	for (const value of Object.values(responseObject)) {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const nestedTotal = getTotalCount(value);
			if (nestedTotal !== undefined) {
				return nestedTotal;
			}
		}
	}

	return undefined;
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
					{ name: 'Sequence', value: 'sequence' },
					{ name: 'Sync', value: 'sync' },
					{ name: 'Task', value: 'task' },
					{ name: 'Template', value: 'template' },
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
					{ name: 'Sync', value: 'sync', action: 'Sync companies from CRM' },
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
					{ name: 'Sync', value: 'sync', action: 'Sync contacts from CRM' },
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
					{ name: 'Sync', value: 'sync', action: 'Sync deals from CRM' },
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
				options: [
					{ name: 'Add Companies', value: 'addCompanies', action: 'Add companies to a list' },
					{ name: 'Add Contacts', value: 'addContacts', action: 'Add contacts to a list' },
					{ name: 'Add Sequences', value: 'addSequences', action: 'Add sequences to a list' },
					{ name: 'Add Templates', value: 'addTemplates', action: 'Add templates to a list' },
					{ name: 'Create', value: 'create', action: 'Create a list' },
					{ name: 'Delete', value: 'delete', action: 'Delete a list' },
					{ name: 'Get', value: 'get', action: 'Get a list' },
					{
						name: 'Remove Companies',
						value: 'removeCompanies',
						action: 'Remove companies from a list',
					},
					{
						name: 'Remove Contacts',
						value: 'removeContacts',
						action: 'Remove contacts from a list',
					},
					{
						name: 'Remove Sequences',
						value: 'removeSequences',
						action: 'Remove sequences from a list',
					},
					{
						name: 'Remove Templates',
						value: 'removeTemplates',
						action: 'Remove templates from a list',
					},
					{ name: 'Search', value: 'search', action: 'Search lists' },
					{ name: 'Update', value: 'update', action: 'Update a list' },
				],
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
					show: { resource: ['sequence'] },
				},
				options: [
					{
						name: 'Add Contacts',
						value: 'addContacts',
						action: 'Add contacts to a sequence',
					},
					{ name: 'Create', value: 'create', action: 'Create a sequence' },
					{ name: 'Search Sequence', value: 'search', action: 'Search sequence' },
					{
						name: 'Search Sequence Details',
						value: 'searchDetails',
						action: 'Search sequence details',
					},
					{
						name: 'Stop Contact Sequence',
						value: 'stopContactSequence',
						action: 'Stop sequence for a contact',
					},
				],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['template'] },
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get a template' },
					{ name: 'Search', value: 'search', action: 'Search templates' },
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
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['sync'] },
				},
				options: [
					{ name: 'Get', value: 'get', action: 'Get a sync job' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many sync jobs' },
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
						resource: ['company', 'contact', 'deal', 'note', 'activity', 'template'],
						operation: ['get'],
					},
				},
			},
			{
				displayName: 'List ID',
				name: 'listId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
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
				displayName: 'Sync ID',
				name: 'syncId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['sync'],
						operation: ['get'],
					},
				},
				description: 'Numeric identifier of the sync job to retrieve (returned by the originating sync request)',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'activity', 'user', 'import'],
						operation: ['getAll'],
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
						returnAll: [false],
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
						returnAll: [false],
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
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: {
						resource: [
							'company',
							'contact',
							'deal',
							'note',
							'activity',
							'list',
							'sequence',
							'template',
							'user',
							'task',
						],
						operation: ['search', 'searchDetails'],
						useRawJsonSearch: [false],
					},
				},
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
							'sequence',
							'template',
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
							'sequence',
							'template',
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
						resource: ['company', 'contact', 'deal', 'note', 'task', 'list', 'sequence'],
						operation: ['create', 'update', 'import', 'sync', 'addContacts', 'stopContactSequence'],
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
						resource: ['company', 'contact', 'deal', 'note', 'task', 'list', 'sequence'],
						operation: ['create', 'update', 'import', 'sync', 'addContacts', 'stopContactSequence'],
						useRawJsonData: [true],
					},
				},
				description: 'Raw data object. The node wraps it under "data" automatically.',
			},
			{
				displayName: 'Additional Fields',
				name: 'dataAdditionalFields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				displayOptions: {
					show: {
						resource: ['company', 'contact', 'deal', 'note', 'task', 'list', 'sequence'],
						operation: ['create', 'update', 'import', 'sync', 'addContacts', 'stopContactSequence'],
						useRawJsonData: [false],
					},
				},
				description: 'Additional data fields to merge into the payload',
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
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
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'searchAdditionalFields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
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
							'sequence',
							'template',
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
						name: 'field',
						displayName: 'Field',
						values: [
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
				displayName: 'User ID',
				name: 'companyCreateUserId',
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
				displayName: 'Generate AI Variables (JSON)',
				name: 'companyCreateGenerateAiVariables',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Generate AI variables request payload',
			},
			{
				displayName: 'Company ID',
				name: 'companyUpdateAccountId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Company ID to update',
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
				displayName: 'Companies',
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
				description: 'Companies to import',
				options: [
					{
						name: 'account',
						displayName: 'Company',
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
				displayName: 'Object IDs',
				name: 'companySyncObjectIds',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of CRM object IDs of the companies to synchronize',
			},
			{
				displayName: 'List ID',
				name: 'companySyncListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['company'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description:
					'Optional Crono list ID. When provided, the synchronized companies are also added to this list at the end of the job.',
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
				displayName: 'Company ID',
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
				description: 'Company ID to associate with the contact',
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
				displayName: 'Sequence ID',
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
				description: 'Sequence ID to add the contact to',
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
				displayName: 'Contact ID',
				name: 'contactUpdateProspectId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact ID to update',
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
				displayName: 'Contacts',
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
				description: 'Contacts to import',
				options: [
					{
						name: 'prospect',
						displayName: 'Contact',
						values: [
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
								displayName: 'Company External Values (JSON)',
								name: 'accountExternalValues',
								type: 'json',
								default: {},
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
								displayName: 'Sequence ID',
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
				displayName: 'Object IDs',
				name: 'contactSyncObjectIds',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of CRM object IDs of the contacts to synchronize',
			},
			{
				displayName: 'Is Lead',
				name: 'contactSyncIsLead',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the provided object IDs should be treated as leads instead of contacts',
			},
			{
				displayName: 'List ID',
				name: 'contactSyncListId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description:
					'Optional Crono list ID. When provided, the synchronized contacts are also added to this list at the end of the job.',
			},
			{
				displayName: 'Strategy ID',
				name: 'contactSyncStrategyId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description:
					'Optional Crono sequence (strategy) ID. When provided, the synchronized contacts are also enrolled in this sequence at the end of the job.',
			},
			{
				displayName: 'Company ID',
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
				description: 'Company ID linked to the deal',
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
				type: 'string',
				default: '',
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the deal',
			},
			{
				displayName: 'Deal ID',
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
				description: 'Deal ID to update',
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
				type: 'string',
				default: '',
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
				displayName: 'Object IDs',
				name: 'dealSyncObjectIds',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['sync'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated list of CRM object IDs of the deals to synchronize',
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the note',
			},
			{
				displayName: 'Deal ID',
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
				description: 'Deal ID linked to the note',
			},
			{
				displayName: 'Contact IDs',
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
				description: 'Comma-separated list of contact IDs',
			},
			{
				displayName: 'Company ID',
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
				description: 'Company ID linked to the task',
			},
			{
				displayName: 'Contact ID',
				name: 'taskCreateProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact ID linked to the task',
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
				default: '',
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
					{ name: 'None', value: '' },
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
				displayName: 'Deal ID',
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
				description: 'Deal ID linked to the task',
			},
			{
				displayName: 'Assign To User',
				name: 'taskCreateAssignToUser',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['task'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the task should be assigned to the selected user',
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
						returnAll: [false],
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
						returnAll: [false],
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
				displayName: 'Contact ID',
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
				description: 'Filter tasks by contact ID',
			},
			{
				displayName: 'Deal ID',
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
				description: 'Filter tasks by deal ID',
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
				default: '',
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
					{ name: 'None', value: '' },
				],
				description: 'Task type',
			},
			{
				displayName: 'Subtype',
				name: 'taskSearchSubtype',
				type: 'options',
				default: '',
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
					{ name: 'None', value: '' },
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
				displayName: 'Subtypes',
				name: 'taskSearchSubtypes',
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
					{ name: 'LinkedIn Invitation', value: 'LinkedinInvitation' },
					{ name: 'LinkedIn Like Last Post', value: 'LinkedinLikeLastPost' },
					{ name: 'LinkedIn Message', value: 'LinkedinMessage' },
					{ name: 'LinkedIn Profile View', value: 'LinkedinProfileView' },
					{ name: 'LinkedIn Voice Note', value: 'LinkedinVoiceNote' },
				],
				description: 'Task subtypes',
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
				displayName: 'Has Deal',
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
				displayName: 'Company ID',
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
				description: 'Filter by company ID',
			},
			{
				displayName: 'Contact List ID',
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
				description: 'Filter by contact list ID',
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
				displayName: 'Company List ID',
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
				description: 'Filter by company list ID',
			},
			{
				displayName: 'Sequence ID',
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
				description: 'Filter by sequence ID',
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
				displayName: 'Company External Properties (JSON)',
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
				description: 'Company external property filters',
			},
			{
				displayName: 'Contact External Properties (JSON)',
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
				description: 'Contact external property filters',
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
				displayName: 'With Contact Score',
				name: 'taskSearchWithProspectScore',
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
				displayName: 'With Company Score',
				name: 'taskSearchWithAccountScore',
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
				displayName: 'Lead Score Levels',
				name: 'taskSearchLeadScoreLevels',
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
					{ name: 'High', value: 'High' },
					{ name: 'Low', value: 'Low' },
					{ name: 'Medium', value: 'Medium' },
				],
			},
			{
				displayName: 'Contact Score Levels',
				name: 'taskSearchProspectScoreLevels',
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
					{ name: 'High', value: 'High' },
					{ name: 'Low', value: 'Low' },
					{ name: 'Medium', value: 'Medium' },
				],
			},
			{
				displayName: 'Company Score Levels',
				name: 'taskSearchAccountScoreLevels',
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
					{ name: 'High', value: 'High' },
					{ name: 'Low', value: 'Low' },
					{ name: 'Medium', value: 'Medium' },
				],
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
						returnAll: [false],
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
						returnAll: [false],
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
					{ name: 'Open Deal', value: 'OpenOpportunity' },
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
					{ name: 'Score', value: 'Score' },
					{ name: 'Score Desc', value: 'ScoreDesc' },
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
				},
			},
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
				displayName: 'Include Tasks Analytics',
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
				displayName: 'Include User',
				name: 'companySearchIncludeUser',
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
				type: 'string',
				default: '',
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
						returnAll: [false],
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
						returnAll: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Company External Properties (JSON)',
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
				description: 'Company external property filters',
			},
			{
				displayName: 'Company External Property Empty IDs',
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
				description: 'Comma-separated list of company external property IDs to match empty values',
			},
			{
				displayName: 'Company External Property Numeric Filters (JSON)',
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
				description: 'Company external property numeric filters',
			},
			{
				displayName: 'Company ID',
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
				displayName: 'Company Status',
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
					{ name: 'Open Deal', value: 'OpenOpportunity' },
					{ name: 'Working', value: 'Working' },
				],
				description: 'Company status filters',
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
				displayName: 'Has Email Address',
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
				displayName: 'Has LinkedIn Url',
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
				displayName: 'LinkedIn Status',
				name: 'contactSearchLinkedinStatus',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Connected', value: 'Connected' },
					{ name: 'Invitation Sent', value: 'InvitationSent' },
					{ name: 'Not Connected', value: 'NotConnected' },
					{ name: 'Unknown', value: 'Unknown' },
				],
				description: 'Filter by LinkedIn connection status related to the owner',
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
					{ name: 'Contact ID', value: 'ProspectId' },
					{ name: 'Created Date', value: 'CreatedDate' },
					{ name: 'Created Date Desc', value: 'CreatedDateDesc' },
					{ name: 'Last Activity', value: 'LastActivity' },
					{ name: 'Last Activity Desc', value: 'LastActivityDesc' },
					{ name: 'Name', value: 'Name' },
					{ name: 'Name Desc', value: 'NameDesc' },
					{ name: 'Owner', value: 'Owner' },
					{ name: 'Owner Desc', value: 'OwnerDesc' },
					{ name: 'Score', value: 'Score' },
					{ name: 'Score Desc', value: 'ScoreDesc' },
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
					{ name: 'Accept All', value: 'AcceptAll' },
					{ name: 'Invalid', value: 'Invalid' },
					{ name: 'Unknown', value: 'Unknown' },
					{ name: 'Valid', value: 'Valid' },
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the deal',
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
				displayName: 'Stages',
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
				description: 'Comma-separated list of deal stages',
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
						returnAll: [false],
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
						returnAll: [false],
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
				displayName: 'Last Activity Date Min',
				name: 'dealSearchLastActivityDateMin',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Minimum last activity date',
			},
			{
				displayName: 'Last Activity Date Max',
				name: 'dealSearchLastActivityDateMax',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['deal'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Maximum last activity date',
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
				displayName: 'Include Company',
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
				displayName: 'Include External Values',
				name: 'dealSearchIncludeExternalValues',
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
				displayName: 'Include User',
				name: 'dealSearchIncludeUser',
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the note',
			},
			{
				displayName: 'Deal ID',
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
				description: 'Deal ID linked to the note',
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
						returnAll: [false],
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
						returnAll: [false],
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
				displayName: 'Include User',
				name: 'noteSearchIncludeUser',
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
				displayName: 'Include Company',
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
				displayName: 'Include Deal',
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
				displayName: 'Include Contacts',
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the activity',
			},
			{
				displayName: 'Contact ID',
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
				description: 'Contact ID linked to the activity',
			},
			{
				displayName: 'Deal ID',
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
				description: 'Deal ID linked to the activity',
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
						returnAll: [false],
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
						returnAll: [false],
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
				displayName: 'Include User',
				name: 'activitySearchIncludeUser',
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
				displayName: 'Include Company',
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
				displayName: 'Include Deal',
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
				displayName: 'Include Template Title',
				name: 'activitySearchIncludeTemplateTitle',
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
				displayName: 'Include Contact',
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
				displayName: 'Company ID',
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
				description: 'Company ID linked to the list',
			},
			{
				displayName: 'Contact ID',
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
				description: 'Contact ID linked to the list',
			},
			{
				displayName: 'Sequence ID',
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
				description: 'Sequence ID linked to the list',
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
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Company', value: 'Account' },
					{ name: 'Contact', value: 'Prospect' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Sequence', value: 'Strategy' },
					{ name: 'Template', value: 'Template' },
					{ name: 'User', value: 'User' },
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
						returnAll: [false],
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
						returnAll: [false],
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
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Sequence name',
			},
			{
				displayName: 'Company ID',
				name: 'strategySearchAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Company ID linked to the sequence',
			},
			{
				displayName: 'Contact ID',
				name: 'strategySearchProspectId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Contact ID linked to the sequence',
			},
			{
				displayName: 'User ID',
				name: 'strategySearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
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
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Comma-separated list of sequence IDs',
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
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
						returnAll: [false],
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
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
						returnAll: [false],
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
						resource: ['sequence'],
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
				displayName: 'Sequence Tags (JSON)',
				name: 'strategySearchTags',
				type: 'json',
				default: {},
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Array of sequence tags',
			},
			{
				displayName: 'Include Active Sequence Instances',
				name: 'strategySearchIncludeActiveSequenceInstances',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['sequence'],
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
						resource: ['sequence'],
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
						resource: ['sequence'],
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
						resource: ['sequence'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Sequence ID',
				name: 'strategyDetailsStrategyId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Sequence ID to retrieve details for',
			},
			{
				displayName: 'Text',
				name: 'strategyDetailsText',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Free-text filter for sequence details',
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
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
						returnAll: [false],
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
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
						returnAll: [false],
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
						resource: ['sequence'],
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
					{ name: 'Score Asc', value: 'ScoreAsc' },
					{ name: 'Score Desc', value: 'ScoreDesc' },
				],
				description: 'Sort order',
			},
			{
				displayName: 'Status',
				name: 'strategyDetailsStatus',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'Active', value: 'Active' },
					{ name: 'Answered', value: 'Answered' },
					{ name: 'Any', value: '' },
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
						resource: ['sequence'],
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
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Only My Contacts',
				name: 'strategyDetailsOnlyMyProspects',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['searchDetails'],
						useRawJsonSearch: [false],
					},
				},
			},
			{
				displayName: 'Table Type',
				name: 'externalPropertySearchTableType',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['externalProperty'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Company', value: 'Account' },
					{ name: 'Contact', value: 'Prospect' },
					{ name: 'Deal', value: 'Opportunity' },
					{ name: 'Lead', value: 'Lead' },
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
				displayName: 'Name',
				name: 'userSearchName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'User name',
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
						returnAll: [false],
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
						returnAll: [false],
					},
				},
				description: 'Number of results to skip',
			},
			{
				displayName: 'Name',
				name: 'listCreateName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'List name',
			},
			{
				displayName: 'Type',
				name: 'listCreateType',
				type: 'options',
				default: 'Account',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				options: [
					{ name: 'Company', value: 'Account' },
					{ name: 'Contact', value: 'Prospect' },
					{ name: 'Lead', value: 'Lead' },
					{ name: 'Sequence', value: 'Strategy' },
					{ name: 'Template', value: 'Template' },
					{ name: 'User', value: 'User' },
				],
				description: 'List table type',
			},
			{
				displayName: 'Shared',
				name: 'listCreateShared',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the list is shared',
			},
			{
				displayName: 'Shared Users IDs',
				name: 'listCreateSharedUsersIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated user IDs to share the list with',
			},
			{
				displayName: 'Object IDs',
				name: 'listCreateObjectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated object IDs for Company/Contact lists',
			},
			{
				displayName: 'IDs',
				name: 'listCreateIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated numeric IDs for Template/Sequence lists',
			},
			{
				displayName: 'List ID',
				name: 'listUpdateId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'ID of the list to update',
			},
			{
				displayName: 'Name',
				name: 'listUpdateName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'New list name',
			},
			{
				displayName: 'Shared',
				name: 'listUpdateShared',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the list is shared',
			},
			{
				displayName: 'Shared Users IDs',
				name: 'listUpdateSharedUsersIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['update'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated user IDs to share the list with',
			},
			{
				displayName: 'List ID',
				name: 'listDeleteListId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['delete'],
					},
				},
				description: 'ID of the list to delete',
			},
			{
				displayName: 'List ID',
				name: 'listEntityListId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: [
							'addContacts',
							'removeContacts',
							'addCompanies',
							'removeCompanies',
							'addTemplates',
							'removeTemplates',
							'addSequences',
							'removeSequences',
						],
					},
				},
				description: 'Target list ID',
			},
			{
				displayName: 'Object IDs',
				name: 'listEntityObjectIds',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['addContacts', 'removeContacts', 'addCompanies', 'removeCompanies'],
					},
				},
				description: 'Comma-separated object IDs',
			},
			{
				displayName: 'IDs',
				name: 'listEntityIds',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['list'],
						operation: ['addTemplates', 'removeTemplates', 'addSequences', 'removeSequences'],
					},
				},
				description: 'Comma-separated numeric IDs',
			},
			{
				displayName: 'Sequence ID',
				name: 'strategyAddContactsStrategyId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['addContacts'],
						useRawJsonData: [false],
					},
				},
				description: 'Sequence ID to enroll contacts into',
			},
			{
				displayName: 'Contact IDs',
				name: 'strategyAddContactsProspectIds',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['addContacts'],
						useRawJsonData: [false],
					},
				},
				description: 'Comma-separated contact object IDs',
			},
			{
				displayName: 'Contact ID',
				name: 'strategyStopContactProspectId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['stopContactSequence'],
						useRawJsonData: [false],
					},
				},
				description: 'Contact object ID whose sequence must be stopped',
			},
			{
				displayName: 'Name',
				name: 'strategyCreateName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Sequence name',
			},
			{
				displayName: 'Shared',
				name: 'strategyCreateShared',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description: 'Whether the sequence is shared with the rest of the subscription',
			},
			{
				displayName: 'Steps (JSON)',
				name: 'strategyCreateSteps',
				type: 'json',
				default: [],
				required: true,
				displayOptions: {
					show: {
						resource: ['sequence'],
						operation: ['create'],
						useRawJsonData: [false],
					},
				},
				description:
					'Array of sequence steps. Each step can include Type, Subtype, Automatic, ReplyToThread, Delay, ScheduleTime, TemplateId, Subject, Content, and Description.',
			},
			{
				displayName: 'Title',
				name: 'templateSearchTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Template title filter',
			},
			{
				displayName: 'Type',
				name: 'templateSearchType',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Email', value: 'Email' },
					{ name: 'In Mail', value: 'InMail' },
					{ name: 'Invitation', value: 'Invitation' },
					{ name: 'Linkedin', value: 'Linkedin' },
					{ name: 'Script', value: 'Script' },
					{ name: 'Voice Note', value: 'VoiceNote' },
				],
				description: 'Template type filter',
			},
			{
				displayName: 'Language',
				name: 'templateSearchLanguage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Language filter',
			},
			{
				displayName: 'Shared',
				name: 'templateSearchShared',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether template is shared',
			},
			{
				displayName: 'Archived',
				name: 'templateSearchArchived',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether template is archived',
			},
			{
				displayName: 'User ID',
				name: 'templateSearchUserId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Owner user ID filter',
			},
			{
				displayName: 'Include User',
				name: 'templateSearchIncludeUser',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether to include template owner user',
			},
			{
				displayName: 'Include Template Tags',
				name: 'templateSearchIncludeTemplateTags',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether to include template tags',
			},
			{
				displayName: 'Include Lists',
				name: 'templateSearchIncludeCronoLists',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
					},
				},
				description: 'Whether to include linked lists',
			},
			{
				displayName: 'Limit',
				name: 'templateSearchLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
						returnAll: [false],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'templateSearchOffset',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['search'],
						useRawJsonSearch: [false],
						returnAll: [false],
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
					{ name: 'All', value: '' },
					{ name: 'Company', value: 'Account' },
					{ name: 'Contact', value: 'Prospect' },
					{ name: 'Deal', value: 'Opportunity' },
					{ name: 'Lead', value: 'Lead' },
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
			{
				displayName: 'Sync Type',
				name: 'syncType',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['sync'],
						operation: ['getAll'],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Company', value: 'Account' },
					{ name: 'Contact', value: 'Prospect' },
					{ name: 'Deal', value: 'Opportunity' },
				],
				description: 'Filter sync jobs by table type',
			},
			{
				displayName: 'Sync Status',
				name: 'syncStatus',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['sync'],
						operation: ['getAll'],
					},
				},
				options: [
					{ name: 'All', value: '' },
					{ name: 'Completed', value: 'Completed' },
					{ name: 'Completed With Errors', value: 'CompletedWithErrors' },
					{ name: 'On Going', value: 'OnGoing' },
					{ name: 'Started', value: 'Started' },
				],
				description: 'Filter sync jobs by status',
			},
			{
				displayName: 'Limit',
				name: 'syncLimit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['sync'],
						operation: ['getAll'],
					},
				},
				description:
					'Max number of sync jobs to return, ordered by start date descending (capped at 100)',
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
			const useRawJsonSearch = this.getNodeParameter(
				'useRawJsonSearch',
				itemIndex,
				false,
			) as boolean;
			const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;

			let endpoint = '';
			let method: IHttpRequestMethods = 'GET';
			let qs: IDataObject = {};
			let body: IDataObject | undefined;

			if (operation === 'getAll') {
				const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
				const offset = this.getNodeParameter('offset', itemIndex, 0) as number;
				qs = { Limit: limit, Offset: offset };
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
								this.getNodeParameter('companySearchIncludeExternalValuesNoTags', itemIndex, false)
							) {
								includes.WithExternalValuesNoTags = true;
							}
							if (this.getNodeParameter('companySearchIncludeTags', itemIndex, false)) {
								includes.WithTags = true;
							}
							if (this.getNodeParameter('companySearchIncludeTasks', itemIndex, false)) {
								includes.WithTasksAnalytics = true;
							}
							if (this.getNodeParameter('companySearchIncludeUser', itemIndex, false)) {
								includes.WithUser = true;
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
								'UserId',
								this.getNodeParameter('companyCreateUserId', itemIndex, ''),
							);
							const listId = this.getNodeParameter('companyCreateListId', itemIndex, 0) as number;
							if (listId) {
								data.ListId = listId;
							}
							const generateAiVariables = getJsonParameter(
								this,
								'companyCreateGenerateAiVariables',
								itemIndex,
								{},
							);
							if (Object.keys(generateAiVariables).length) {
								data.GenerateAiVariables = generateAiVariables;
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
								'AccountId',
								this.getNodeParameter('companyUpdateAccountId', itemIndex, ''),
							);
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
							addIfNotEmpty(
								data,
								'UserId',
								this.getNodeParameter('companyUpdateUserId', itemIndex, ''),
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
								this.getNodeParameter(
									'companyImportAiExternalPropertyIds',
									itemIndex,
									'',
								) as string,
							);
							if (aiExternalPropertyIds.length) {
								data.AiExternalPropertiesIdsToGenerate = aiExternalPropertyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'sync') {
						method = 'POST';
						endpoint = `${endpoint}/sync`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const objectIds = parseCsv(
								this.getNodeParameter('companySyncObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								data.ObjectIds = objectIds;
							}
							const listId = this.getNodeParameter('companySyncListId', itemIndex, 0) as number;
							if (listId) {
								data.ListId = listId;
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
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('contactSearchUserId', itemIndex, ''),
							);
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
							addIfNotEmpty(
								searchBody,
								'LinkedinStatus',
								this.getNodeParameter('contactSearchLinkedinStatus', itemIndex, ''),
							);
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
							addIfNotEmpty(
								data,
								'UserId',
								this.getNodeParameter('contactCreateUserId', itemIndex, ''),
							);
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
								'ProspectId',
								this.getNodeParameter('contactUpdateProspectId', itemIndex, ''),
							);
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
							addIfNotEmpty(
								data,
								'UserId',
								this.getNodeParameter('contactUpdateUserId', itemIndex, ''),
							);
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
								this.getNodeParameter(
									'contactImportAiExternalPropertyIds',
									itemIndex,
									'',
								) as string,
							);
							if (aiExternalPropertyIds.length) {
								data.AiExternalPropertiesIdsToGenerate = aiExternalPropertyIds.map((id) =>
									parseInt(id, 10),
								);
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'sync') {
						method = 'POST';
						endpoint = `${endpoint}/sync`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const objectIds = parseCsv(
								this.getNodeParameter('contactSyncObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								data.ObjectIds = objectIds;
							}
							if (this.getNodeParameter('contactSyncIsLead', itemIndex, false)) {
								data.IsLead = true;
							}
							const listId = this.getNodeParameter('contactSyncListId', itemIndex, 0) as number;
							if (listId) {
								data.ListId = listId;
							}
							const strategyId = this.getNodeParameter(
								'contactSyncStrategyId',
								itemIndex,
								0,
							) as number;
							if (strategyId) {
								data.StrategyId = strategyId;
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
								'Pipeline',
								this.getNodeParameter('dealSearchPipeline', itemIndex, ''),
							);
							const stages = parseCsv(
								this.getNodeParameter('dealSearchStage', itemIndex, '') as string,
							);
							if (stages.length) {
								searchBody.Stages = stages;
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
								'LastActivityDateMin',
								this.getNodeParameter('dealSearchLastActivityDateMin', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'LastActivityDateMax',
								this.getNodeParameter('dealSearchLastActivityDateMax', itemIndex, ''),
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
							if (this.getNodeParameter('dealSearchIncludeExternalValues', itemIndex, false)) {
								includes.WithExternalValues = true;
							}
							if (this.getNodeParameter('dealSearchIncludeUser', itemIndex, false)) {
								includes.WithUser = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Includes = includes;
							}
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
							addIfNotEmpty(data, 'Name', this.getNodeParameter('dealCreateName', itemIndex, ''));
							const amount = this.getNodeParameter('dealCreateAmount', itemIndex, 0) as number;
							if (amount) {
								data.Amount = amount;
							}
							addIfNotEmpty(data, 'Stage', this.getNodeParameter('dealCreateStage', itemIndex, ''));
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
							addIfNotEmpty(
								data,
								'UserId',
								this.getNodeParameter('dealCreateUserId', itemIndex, ''),
							);
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
							addIfNotEmpty(data, 'Name', this.getNodeParameter('dealUpdateName', itemIndex, ''));
							const amount = this.getNodeParameter('dealUpdateAmount', itemIndex, 0) as number;
							if (amount) {
								data.Amount = amount;
							}
							addIfNotEmpty(data, 'Stage', this.getNodeParameter('dealUpdateStage', itemIndex, ''));
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
							addIfNotEmpty(
								data,
								'UserId',
								this.getNodeParameter('dealUpdateUserId', itemIndex, ''),
							);
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'sync') {
						method = 'POST';
						endpoint = `${endpoint}/sync`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const objectIds = parseCsv(
								this.getNodeParameter('dealSyncObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								data.ObjectIds = objectIds;
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
							if (this.getNodeParameter('noteSearchIncludeUser', itemIndex, false)) {
								includes.WithUser = true;
							}
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
							const subtypes = this.getNodeParameter(
								'taskSearchSubtypes',
								itemIndex,
								[],
							) as string[];
							if (subtypes.length) {
								searchBody.Subtypes = subtypes;
							}
							addIfNotEmpty(
								searchBody,
								'Since',
								this.getNodeParameter('taskSearchSince', itemIndex, ''),
							);
							addIfNotEmpty(searchBody, 'To', this.getNodeParameter('taskSearchTo', itemIndex, ''));
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
							if (this.getNodeParameter('taskSearchWithProspectScore', itemIndex, false)) {
								searchBody.WithProspectScore = true;
							}
							if (this.getNodeParameter('taskSearchWithAccountScore', itemIndex, false)) {
								searchBody.WithAccountScore = true;
							}
							const leadScoreLevels = this.getNodeParameter(
								'taskSearchLeadScoreLevels',
								itemIndex,
								[],
							) as string[];
							if (leadScoreLevels.length) {
								searchBody.LeadScoreLevels = leadScoreLevels;
							}
							const prospectScoreLevels = this.getNodeParameter(
								'taskSearchProspectScoreLevels',
								itemIndex,
								[],
							) as string[];
							if (prospectScoreLevels.length) {
								searchBody.ProspectScoreLevels = prospectScoreLevels;
							}
							const accountScoreLevels = this.getNodeParameter(
								'taskSearchAccountScoreLevels',
								itemIndex,
								[],
							) as string[];
							if (accountScoreLevels.length) {
								searchBody.AccountScoreLevels = accountScoreLevels;
							}
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
							addIfNotEmpty(data, 'Type', this.getNodeParameter('taskCreateType', itemIndex, ''));
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
							const templateId = this.getNodeParameter(
								'taskCreateTemplateId',
								itemIndex,
								0,
							) as number;
							if (templateId) {
								data.TemplateId = templateId;
							}
							data.Automatic = this.getNodeParameter(
								'taskCreateAutomatic',
								itemIndex,
								false,
							) as boolean;
							addIfNotEmpty(
								data,
								'OpportunityId',
								this.getNodeParameter('taskCreateOpportunityId', itemIndex, ''),
							);
							if (this.getNodeParameter('taskCreateAssignToUser', itemIndex, false)) {
								data.AssignToUser = true;
							}
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
							if (this.getNodeParameter('activitySearchIncludeUser', itemIndex, false)) {
								includes.WithUser = true;
							}
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
							if (this.getNodeParameter('activitySearchIncludeTemplateTitle', itemIndex, false)) {
								includes.WithTemplateTitle = true;
							}
							if (Object.keys(includes).length) {
								searchBody.Include = includes;
							}
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
							body = searchBody;
						}
					}
					break;
				}
				case 'list': {
					endpoint = `${basePath}/CronoLists`;
					if (operation === 'get') {
						method = 'GET';
						const listId = this.getNodeParameter('listId', itemIndex) as number;
						endpoint = `${endpoint}/${listId}`;
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
							const strategyId = this.getNodeParameter(
								'listSearchStrategyId',
								itemIndex,
								0,
							) as number;
							if (strategyId) {
								searchBody.StrategyId = strategyId;
							}
							const templateId = this.getNodeParameter(
								'listSearchTemplateId',
								itemIndex,
								0,
							) as number;
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
								this.getNodeParameter('listSearchType', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'SortType',
								this.getNodeParameter('listSearchSortType', itemIndex, ''),
							);
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
							body = searchBody;
						}
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(data, 'Name', this.getNodeParameter('listCreateName', itemIndex, ''));
							addIfNotEmpty(
								data,
								'Type',
								this.getNodeParameter('listCreateType', itemIndex, 'Account'),
							);
							if (this.getNodeParameter('listCreateShared', itemIndex, false)) {
								data.Shared = true;
							}
							const sharedUsersIds = parseCsv(
								this.getNodeParameter('listCreateSharedUsersIds', itemIndex, '') as string,
							);
							if (sharedUsersIds.length) {
								data.SharedUsersIds = sharedUsersIds.map((id) => parseInt(id, 10));
							}
							const objectIds = parseCsv(
								this.getNodeParameter('listCreateObjectIds', itemIndex, '') as string,
							);
							if (objectIds.length) {
								data.ObjectIds = objectIds;
							}
							const ids = parseCsv(this.getNodeParameter('listCreateIds', itemIndex, '') as string);
							if (ids.length) {
								data.Ids = ids.map((id) => parseInt(id, 10));
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
							const listUpdateId = this.getNodeParameter('listUpdateId', itemIndex, 0) as number;
							if (listUpdateId) {
								data.Id = listUpdateId;
							}
							addIfNotEmpty(data, 'Name', this.getNodeParameter('listUpdateName', itemIndex, ''));
							if (this.getNodeParameter('listUpdateShared', itemIndex, false)) {
								data.Shared = true;
							}
							const sharedUsersIds = parseCsv(
								this.getNodeParameter('listUpdateSharedUsersIds', itemIndex, '') as string,
							);
							if (sharedUsersIds.length) {
								data.SharedUsersIds = sharedUsersIds;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'delete') {
						method = 'DELETE';
						const listId = this.getNodeParameter('listDeleteListId', itemIndex, 0) as number;
						body = { listId };
					} else if (
						['addContacts', 'removeContacts', 'addCompanies', 'removeCompanies'].includes(operation)
					) {
						method = operation.startsWith('remove') ? 'DELETE' : 'POST';
						endpoint = `${endpoint}/${operation.includes('Contacts') ? 'Prospect' : 'Account'}`;
						const listId = this.getNodeParameter('listEntityListId', itemIndex, 0) as number;
						const objectIds = parseCsv(
							this.getNodeParameter('listEntityObjectIds', itemIndex, '') as string,
						);
						body = { listId, objectIds };
					} else if (
						['addTemplates', 'removeTemplates', 'addSequences', 'removeSequences'].includes(
							operation,
						)
					) {
						method = operation.startsWith('remove') ? 'DELETE' : 'POST';
						endpoint = `${endpoint}/${operation.includes('Templates') ? 'Template' : 'Strategy'}`;
						const listId = this.getNodeParameter('listEntityListId', itemIndex, 0) as number;
						const ids = parseCsv(this.getNodeParameter('listEntityIds', itemIndex, '') as string);
						body = { listId, ids: ids.map((id) => parseInt(id, 10)) };
					}
					break;
				}
				case 'pipeline': {
					method = 'GET';
					endpoint = `${basePath}/Pipelines`;
					break;
				}
				case 'sequence': {
					endpoint = `${basePath}/Strategies`;
					if (operation === 'addContacts') {
						method = 'POST';
						endpoint = `${endpoint}/prospects`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							const strategyId = this.getNodeParameter(
								'strategyAddContactsStrategyId',
								itemIndex,
								0,
							) as number;
							if (strategyId) {
								data.StrategyId = strategyId;
							}
							const prospectIds = parseCsv(
								this.getNodeParameter('strategyAddContactsProspectIds', itemIndex, '') as string,
							);
							if (prospectIds.length) {
								data.ProspectIds = prospectIds;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'create') {
						method = 'POST';
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'Name',
								this.getNodeParameter('strategyCreateName', itemIndex, ''),
							);
							if (this.getNodeParameter('strategyCreateShared', itemIndex, false)) {
								data.Shared = true;
							}
							const steps = getJsonArrayParameter(this, 'strategyCreateSteps', itemIndex);
							if (steps.length) {
								data.Steps = steps;
							}
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else if (operation === 'stopContactSequence') {
						method = 'POST';
						endpoint = `${endpoint}/prospects/stop`;
						const data: IDataObject = useRawJsonData
							? getJsonParameter(this, 'data', itemIndex)
							: {};
						if (!useRawJsonData) {
							addIfNotEmpty(
								data,
								'ProspectId',
								this.getNodeParameter('strategyStopContactProspectId', itemIndex, ''),
							);
							Object.assign(data, getAdditionalFields(this, 'dataAdditionalFields', itemIndex));
						}
						body = { data };
					} else {
						method = 'POST';
						endpoint = `${endpoint}/${operation === 'searchDetails' ? 'details' : 'search'}`;
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
								searchBody.Ids = ids.map((id) => parseInt(id, 10));
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
							const strategyTags = getJsonParameter(this, 'strategySearchTags', itemIndex, {});
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
							body = searchBody;
						}
					}
					break;
				}
				case 'template': {
					endpoint = `${basePath}/Templates`;
					if (operation === 'get') {
						method = 'GET';
						const objectId = this.getNodeParameter('objectId', itemIndex) as string;
						endpoint = `${endpoint}/${objectId}`;
					} else if (operation === 'search') {
						method = 'POST';
						endpoint = `${endpoint}/search`;
						if (useRawJsonSearch) {
							body = getJsonParameter(this, 'search', itemIndex);
						} else {
							const searchBody: IDataObject = {};
							addIfNotEmpty(
								searchBody,
								'Title',
								this.getNodeParameter('templateSearchTitle', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Type',
								this.getNodeParameter('templateSearchType', itemIndex, ''),
							);
							addIfNotEmpty(
								searchBody,
								'Language',
								this.getNodeParameter('templateSearchLanguage', itemIndex, ''),
							);
							if (this.getNodeParameter('templateSearchShared', itemIndex, false)) {
								searchBody.Shared = true;
							}
							if (this.getNodeParameter('templateSearchArchived', itemIndex, false)) {
								searchBody.Archived = true;
							}
							addIfNotEmpty(
								searchBody,
								'UserId',
								this.getNodeParameter('templateSearchUserId', itemIndex, ''),
							);
							const include: IDataObject = {};
							if (this.getNodeParameter('templateSearchIncludeUser', itemIndex, false)) {
								include.WithUser = true;
							}
							if (this.getNodeParameter('templateSearchIncludeTemplateTags', itemIndex, false)) {
								include.WithTemplateTags = true;
							}
							if (this.getNodeParameter('templateSearchIncludeCronoLists', itemIndex, false)) {
								include.WithCronoLists = true;
							}
							if (Object.keys(include).length) {
								searchBody.Include = include;
							}
							const pagination: IDataObject = {};
							addIfNotEmpty(
								pagination,
								'Limit',
								this.getNodeParameter('templateSearchLimit', itemIndex, 50),
							);
							addIfNotEmpty(
								pagination,
								'Offset',
								this.getNodeParameter('templateSearchOffset', itemIndex, 0),
							);
							if (Object.keys(pagination).length) {
								searchBody.Pagination = pagination;
							}
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
							body = searchBody;
						}
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
						Object.assign(
							searchBody,
							getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
						);
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
							addIfNotEmpty(
								searchBody,
								'Name',
								this.getNodeParameter('userSearchName', itemIndex, ''),
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
							Object.assign(
								searchBody,
								getAdditionalFields(this, 'searchAdditionalFields', itemIndex),
							);
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
				case 'sync': {
					endpoint = `${basePath}/Sync`;
					if (operation === 'get') {
						method = 'GET';
						const syncId = this.getNodeParameter('syncId', itemIndex) as number;
						endpoint = `${endpoint}/${syncId}`;
					} else if (operation === 'getAll') {
						method = 'GET';
						// SyncController only supports `limit` (no offset). Reset qs to drop the default
						// Offset injected by the shared getAll block, then add limit + filters.
						qs = {};
						const syncType = this.getNodeParameter('syncType', itemIndex, '') as string;
						const syncStatus = this.getNodeParameter('syncStatus', itemIndex, '') as string;
						const syncLimit = this.getNodeParameter('syncLimit', itemIndex, 50) as number;
						if (syncLimit) {
							qs.limit = syncLimit;
						}
						if (syncType) {
							qs.type = syncType;
						}
						if (syncStatus) {
							qs.statusType = syncStatus;
						}
					}
					break;
				}
				default:
					throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
						itemIndex,
					});
			}

			const pagination = returnAll && !useRawJsonSearch ? getPaginationConfig(qs, body) : undefined;
			if (pagination) {
				const maxIterations = 100;
				const aggregatedItems: IDataObject[] = [];
				let currentOffset = pagination.offset;
				let iterationCount = 0;
				let fallbackResponse: IDataObject | undefined;
				let reachedMaxIterations = false;
				const pageSize = pagination.limit > 0 ? pagination.limit : 1;

				while (true) {
					iterationCount += 1;
					if (iterationCount > maxIterations) {
						reachedMaxIterations = true;
						break;
					}

					const requestQs = cloneDataObject(qs);
					const requestBody = cloneDataObject(body);
					setPaginationOffset(requestQs, requestBody, pagination, currentOffset);

					const responseData = await cronoApiRequest.call(
						this,
						method,
						endpoint,
						requestQs,
						requestBody,
					);
					const pageItems = extractItemsFromResponse(responseData);

					if (!pageItems) {
						fallbackResponse = responseData as IDataObject;
						break;
					}

					aggregatedItems.push(...pageItems);

					if (pageItems.length === 0) {
						break;
					}

					const totalCount = getTotalCount(responseData);
					const nextOffset = currentOffset + pageSize;
					if (totalCount !== undefined) {
						if (nextOffset >= totalCount) {
							break;
						}
					} else if (pageItems.length < pageSize) {
						break;
					}

					currentOffset = nextOffset;
				}

				if (reachedMaxIterations && fallbackResponse) {
					returnData.push({ json: fallbackResponse, pairedItem: { item: itemIndex } });
				} else if (aggregatedItems.length > 0) {
					returnData.push(
						...aggregatedItems.map((json) => ({
							json,
							pairedItem: { item: itemIndex },
						})),
					);
				} else if (fallbackResponse) {
					returnData.push({ json: fallbackResponse, pairedItem: { item: itemIndex } });
				}
			} else {
				const responseData = await cronoApiRequest.call(this, method, endpoint, qs, body);
				returnData.push({ json: responseData, pairedItem: { item: itemIndex } });
			}
		}

		return [returnData];
	}
}
