# n8n-nodes-crono-public-api

This is an n8n community node. It lets you use Crono Public API in your n8n workflows.

Crono Public API gives programmatic access to Crono CRM data such as companies, contacts, deals, activities, and more.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Resources](#resources)  
[Version history](#version-history)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

- Activities: Get, Get Many, Search
- Companies: Create, Get, Get Many, Search, Update, Import
- Contacts: Create, Get, Get Many, Search, Update, Import
- Deals: Create, Get, Get Many, Search, Update
- External Properties: Search
- Imports: Get, Get Many
- Lists: Search
- Notes: Create, Get, Get Many, Search
- Pipelines: Get Many
- Strategies: Search, Search Details
- Tasks: Create, Search
- Users: Get, Get Many, Search

## Credentials

This node uses Crono Public API credentials.

You need:
- API Key
- API Secret

The node sends credentials via headers:
- `X-Api-Key`
- `X-Api-Secret`

## Compatibility

Minimum n8n version: 1.120.4  
Tested against n8n version: 1.120.4

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Crono Public API documentation](https://ext.crono.one/docs/)

## Version history

* [CHANGELOG](./CHANGELOG.md)

----
