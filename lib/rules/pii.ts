/**
 * Name-based PII detection. Matches whole snake_case tokens so `email` hits
 * `customer_email` but `zip` does not hit `unzipped`.
 */
const PII_PATTERNS: RegExp[] = [
  // contact
  /(^|_)(e_?mail|email_address)(_|$)/,
  /(^|_)(phone|mobile|cell|fax|telephone|msisdn)(_|$)/,
  // names
  /(^|_)(first|last|middle|full|given|family|sur|maiden|customer|contact|patient|employee|person|legal|display)_?name(_|$)/,
  /(^|_)surname(_|$)/,
  // location
  /(^|_)(address|addr|street|address_line\d?|house_number)(_|$)/,
  /(^|_)(post_?code|postal_?code|zip|zip_?code|zipcode)(_|$)/,
  /(^|_)(lat|latitude|lon|lng|longitude|geo_?location|coordinates)(_|$)/,
  // identity documents
  /(^|_)(ssn|social_security(_number)?|national_id|passport(_number)?|driver_?s?_licen[cs]e|tax_id|nin|aadhaar|pan_number)(_|$)/,
  /(^|_)(dob|date_of_birth|birth_?date|birthday)(_|$)/,
  // devices and network
  /(^|_)(ip|ip_?address|ipv4|ipv6|mac_?address|device_id|idfa|gaid|advertising_id|imei)(_|$)/,
  // financial
  /(^|_)(credit_?card|card_?number|cc_?number|iban|account_number|routing_number|bank_account|cvv)(_|$)/,
  // special-category and secrets
  /(^|_)(gender|sex|ethnicity|race|religion|sexual_orientation|health|diagnosis)(_|$)/,
  /(^|_)(password|passwd|pwd|secret|api_key|access_token)(_|$)/,
];

export function looksLikePii(columnName: string): boolean {
  const name = columnName.toLowerCase();
  return PII_PATTERNS.some((re) => re.test(name));
}
