import type { OpenApiDocument } from '../types.js';

export async function loadOpenApiDocument(docUrl: string): Promise<OpenApiDocument> {
  const response = await fetch(docUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI document: ${docUrl} (${response.status})`);
  }

  const document = (await response.json()) as OpenApiDocument;

  if (!document.openapi?.startsWith('3.')) {
    throw new Error(`Only OpenAPI 3.x is supported: ${docUrl}`);
  }

  if (!document.paths || typeof document.paths !== 'object') {
    throw new Error(`OpenAPI document does not contain valid paths: ${docUrl}`);
  }

  return document;
}
