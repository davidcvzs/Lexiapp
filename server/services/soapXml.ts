/** Narrow external SOAP nodes before reading fields; never treat arbitrary XML as a typed record. */
export function xmlObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function xmlText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = xmlObject(value)['#text'];
  return typeof text === 'string' || typeof text === 'number' ? String(text) : '';
}
export function soapResult(value: unknown, response: string, result: string): Record<string, unknown> {
  const root = xmlObject(value);
  const envelope = xmlObject(root['soap:Envelope'] ?? root['soapenv:Envelope']);
  const body = xmlObject(envelope['soap:Body'] ?? envelope['soapenv:Body']);
  return xmlObject(xmlObject(body[response])[result]);
}
