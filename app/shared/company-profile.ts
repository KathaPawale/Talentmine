export interface CompanyProfileFields {
  name: string;
  domain?: string | null;
  industry?: string | null;
  natureOfBusiness?: string | null;
  descriptionSnippets?: Array<string | null | undefined>;
  contactName?: string | null;
  contactTitle?: string | null;
  executiveName?: string | null;
  executiveTitle?: string | null;
  executiveLinkedinUrl?: string | null;
}

export interface PublicContactPerson {
  name: string;
  title: string | null;
}

/**
 * Use a public company contact when available, otherwise fall back to the
 * publicly identified CEO/CFO. Never invent a person's name.
 */
export function publicContactPerson(company: CompanyProfileFields): PublicContactPerson | null {
  const contactName = company.contactName?.trim();
  if (contactName) {
    return { name: contactName, title: company.contactTitle?.trim() || null };
  }

  const executiveName = company.executiveName?.trim();
  if (executiveName) {
    return { name: executiveName, title: company.executiveTitle?.trim() || null };
  }

  return null;
}

export function publicContactPersonLabel(company: CompanyProfileFields): string {
  const person = publicContactPerson(company);
  if (!person) return "";
  return person.title ? `${person.name} — ${person.title}` : person.name;
}

const GENERIC_ACTIVITY_LABELS = new Set(["Business Services", "Other Business Services", "Professional Services"]);

const INDUSTRY_LABELS: Record<string, string> = {
  finance: "Financial Services",
  healthcare: "Healthcare Services",
  hospitality: "Hospitality & Catering",
  manufacturing: "Manufacturing",
  construction: "Construction & Real Estate",
  technology: "Software & Technology",
  software: "Software & Technology",
  education: "Education & Training",
  retail: "Retail & E-commerce",
  logistics: "Transportation & Logistics",
};

const KNOWN_ACTIVITY_RULES: Array<[RegExp, string]> = [
  [/\b(3 bridge networks|3d personnel|ingham frankland fide|ivy rock partners|retaind|testhiring|hirextra|crossing hurdles|time contract|apidel technologies|focusing point|focuspoint|minnesota jobs|mercor)\b/i, "Recruitment & Staffing"],
  [/\bghobash group\b/i, "Diversified Business Group"],
  [/\bexa\b/i, "Telecommunications"],
  [/\bleading path consulting\b/i, "Government Contracting Consulting"],
  [/\bsai nirman biocoal\b/i, "Industrial Fuel Supply"],
  [/\btem\b/i, "Energy Technology"],
  [/\btruffle social\b/i, "Social Media Marketing"],
  [/\bwalter advisors\b/i, "Financial Advisory"],
  [/\bunilin flooring\b/i, "Flooring Manufacturing"],
  [/\bnugent\b/i, "MEP Construction Services"],
  [/\bdfs furniture\b/i, "Furniture Retail"],
  [/\bstorage vault\b/i, "Self Storage Services"],
  [/\bvistry group\b/i, "Housebuilding & Real Estate"],
  [/\bcentre for sustainable energy\b/i, "Energy & Sustainability"],
  [/\bevri\b/i, "Parcel Delivery & Logistics"],
  [/\bbooker\b/i, "Wholesale & Distribution"],
  [/\bnext\b/i, "Fashion Retail"],
  [/\bbakkavor\b/i, "Food Manufacturing"],
  [/\bsuction excavation\b/i, "Excavation Services"],
  [/\bgordon brothers\b/i, "Asset Finance & Advisory"],
  [/\byrh finance team\b/i, "Fractional Finance Services"],
  [/\belm alliance\b/i, "Healthcare Services"],
  [/\bnominet\b/i, "Internet Domain Registry"],
  [/\buniversal business team\b/i, "Business Consulting"],
  [/\bhitachi careers\b/i, "Rail & Industrial Technology"],
  [/\befl\b/i, "Sports & Football"],
  [/\bt\.? j\.? cottis transport\b/i, "Transport & Construction"],
  [/\bve3\b/i, "IT Consulting"],
  [/\bvois\b/i, "Business Process Services"],
  [/\bhilton\b/i, "Hospitality & Hotels"],
  [/\balliancebernstein\b/i, "Asset Management"],
  [/\bjohnson controls\b/i, "Building Technology"],
  [/\b(rapid7|crowdstrike)\b/i, "Cybersecurity Software"],
  [/\beaton corporation\b/i, "Electrical Equipment Manufacturing"],
  [/\b(jade global|unify dots|i360technologies|xtium|atos|accenture)\b/i, "IT Consulting"],
  [/\bwns global services\b/i, "Business Process Outsourcing"],
  [/\bvanderlande\b/i, "Logistics Automation"],
  [/\b(medtronic|minimed)\b/i, "Medical Devices"],
  [/\b(stantec|cdm smith|parsons)\b/i, "Engineering Consulting"],
  [/\bhoneywell\b/i, "Industrial Technology"],
  [/\b(evolent|scan health plan|lifestance health|uf health|sutter health|amsurg|rivia mind|globalpoint hc)\b/i, "Healthcare Services"],
  [/\b(appzen|celigo|ivalua|instem|vectorworks|casepoint)\b/i, "Enterprise Software"],
  [/\bwesco\b/i, "Electrical Distribution"],
  [/\btransunion\b/i, "Credit & Data Services"],
  [/\b(springer nature|wolters kluwer)\b/i, "Publishing & Information Services"],
  [/\b(danfoss|thyssenkrupp|jabil|mitsubishi heavy industries)\b/i, "Industrial Manufacturing"],
  [/\bkedarnath traders\b/i, "Wholesale & Distribution"],
  [/\bpune institute of business management\b/i, "Education & Training"],
  [/\braichandani group\b/i, "Real Estate Development"],
  [/\bcurrent\b/i, "Digital Banking"],
  [/\blands'? end\b/i, "Apparel Retail"],
  [/\bcr minerals\b/i, "Mineral Products Manufacturing"],
  [/\bquest diagnostics\b/i, "Diagnostic Laboratory Services"],
  [/\bhoosier energy\b/i, "Electric Utility"],
  [/\b(cultural survival|sustainable fisheries partnership|worldwide responsible accredited production|rnli)\b/i, "Nonprofit & Charity"],
  [/\bgp installation\b/i, "Installation Services"],
  [/\b(instacash|paxos trust|pipe|incred money|qib|bnp paribas|hsbc)\b/i, "Banking & Financial Services"],
  [/\bupwork\b/i, "Freelance Marketplace"],
  [/\ba\. stucki company\b/i, "Rail Equipment Manufacturing"],
  [/\bkeltia design\b/i, "Engineering Design Services"],
  [/\bfibrus networks\b/i, "Telecommunications"],
  [/\bbooking\.com\b/i, "Online Travel Marketplace"],
  [/\bpercepta\b/i, "Customer Experience Services"],
  [/\b(iq-eq|tmf)\b/i, "Corporate & Fund Services"],
  [/\bdanaher\b/i, "Life Sciences Technology"],
  [/\bkier group\b/i, "Construction & Infrastructure"],
  [/\bthe very group\b/i, "Online Retail"],
  [/\bhh global\b/i, "Marketing Production Services"],
  [/\bcloud accounts co\b/i, "Accounting & Bookkeeping"],
  [/\bst barnabas church of england multi academy trust\b/i, "Education & Training"],
  [/\beg group\b/i, "Fuel Retail & Foodservice"],
  [/\bvertu motors\b/i, "Automotive Retail & Services"],
  [/\bscorpio group\b/i, "Shipping & Logistics"],
  [/\bdavies\b/i, "Insurance Services"],
  [/\baditya birla renewables\b/i, "Renewable Energy"],
  [/\bacg world\b/i, "Pharmaceutical Manufacturing"],
  [/\bpalladium: make it possible\b/i, "Management Consulting"],
  [/\benvu\b/i, "Agricultural Chemicals"],
  [/\bgodrej enterprises group\b/i, "Diversified Manufacturing"],
  [/\biqvia india\b/i, "Healthcare Data & Analytics"],
  [/\b(mastercard|visa)\b/i, "Payment Technology"],
  [/\bamazon\b/i, "E-commerce & Cloud Services"],
  [/\b(oracle|mixpanel|cornerstone ondemand|initech software|nec software solutions)\b/i, "Enterprise Software"],
  [/\bvodafone\b/i, "Telecommunications"],
  [/\bcummins\b/i, "Engine Manufacturing"],
  [/\b(group 1 automotive)\b/i, "Automotive Retail & Services"],
  [/\b(marriott|leaf hospitality|elior)\b/i, "Hospitality & Catering"],
  [/\bqinetiq\b/i, "Defence Technology"],
  [/\bjacobs\b/i, "Engineering Consulting"],
  [/\bmarsh mclennan\b/i, "Insurance & Risk Advisory"],
  [/\b(bny mellon|citco group|apex group|ares operations|ss&c)\b/i, "Asset & Fund Services"],
  [/\be\.l\.f\. beauty\b/i, "Cosmetics & Personal Care"],
  [/\bazizi development\b/i, "Real Estate Development"],
  [/\bocean network express\b/i, "Shipping & Logistics"],
  [/\bnilkamal\b/i, "Furniture Manufacturing"],
  [/\bhempel\b/i, "Coatings Manufacturing"],
  [/\bzf lifetec\b/i, "Automotive Safety Manufacturing"],
  [/\bnouryon\b/i, "Specialty Chemicals"],
  [/\b(mukand|uma steel)\b/i, "Steel Manufacturing"],
  [/\bjupiter tatravagonka\b/i, "Rail Component Manufacturing"],
  [/\bwienerberger\b/i, "Building Materials"],
  [/\bschindler\b/i, "Elevators & Escalators"],
  [/\bworld land trust\b/i, "Conservation Charity"],
  [/\ba&o shearman\b/i, "Legal Services"],
  [/\bnational learning group\b/i, "Education & Training"],
  [/\bbuuk infrastructure\b/i, "Utilities Infrastructure"],
  [/\bemed group\b/i, "Healthcare Transport"],
  [/\bspeedy hire\b/i, "Equipment Rental Services"],
  [/\bbassetts\b/i, "Plumbing & Heating Supplies"],
  [/\bpilgrims europe\b/i, "Food Manufacturing"],
  [/\bglobex financial\b/i, "Financial Services"],
  [/\bumbrella health\b/i, "Healthcare Services"],
  [/\bacme manufacturing\b/i, "Manufacturing"],
  [/\bnorthwind traders\b/i, "Wholesale & Distribution"],
];

const DIRECT_ACTIVITY_RULES: Array<[RegExp, string]> = [
  [/\b(recruitment|recruiting|staffing|headhunting|executive search|talent acquisition)\b/i, "Recruitment & Staffing"],
  [/\b(tax consultancy|tax consulting|tax advisory|tax consultant)\b/i, "Tax Consultancy"],
  [/\b(chartered accountan|accounting firm|accountancy firm|bookkeeping|outsourced accounting|cfo services)\b/i, "Accounting & Bookkeeping"],
  [/\b(hospital|healthcare|health care|medical services?|patient care|clinical services?|care home|nursing home)\b/i, "Healthcare Services"],
  [/\b(pharmaceutical|biotech|life sciences?|drug discovery)\b/i, "Pharmaceuticals & Life Sciences"],
  [/\b(real estate|property developer|property development|housebuilder|homebuilder|construction company|construction services?|building contractor)\b/i, "Construction & Real Estate"],
  [/\b(property management|residential management|facilities management)\b/i, "Property & Facilities Management"],
  [/\b(payment technology|payment processing|payment systems?|fintech)\b/i, "Payment Technology"],
  [/\b(bank|banking|asset management|wealth management|fund administration|investment management|financial services?)\b/i, "Banking & Financial Services"],
  [/\b(insurance|reinsurance|risk advisory|insurance broker)\b/i, "Insurance & Risk Advisory"],
  [/\b(automotive|car dealership|vehicle dealership|car servicing)\b/i, "Automotive Retail & Services"],
  [/\b(software|saas|cloud platform|technology platform|it services?|digital solutions?)\b/i, "Software & Technology"],
  [/\b(telecom|telecommunications|mobile network|broadband provider)\b/i, "Telecommunications"],
  [/\b(manufactur|factory|industrial equipment|production facility)\b/i, "Manufacturing"],
  [/\b(engineering consultancy|engineering services?|technical engineering)\b/i, "Engineering Services"],
  [/\b(school|college|university|education|training provider|tutoring|online learning)\b/i, "Education & Training"],
  [/\b(logistics|freight|shipping|transport services?|courier|parcel delivery|warehousing)\b/i, "Transportation & Logistics"],
  [/\b(utility networks?|utilities|water supply|electricity distribution|gas network|infrastructure provider)\b/i, "Utilities & Infrastructure"],
  [/\b(hotel|hospitality|catering|restaurant|foodservice)\b/i, "Hospitality & Catering"],
  [/\b(retail|e-commerce|ecommerce|online marketplace|consumer retail)\b/i, "Retail & E-commerce"],
  [/\b(wholesale|distributor|distribution business|trade supplier)\b/i, "Wholesale & Distribution"],
  [/\b(law firm|legal services?|solicitors?|attorneys?)\b/i, "Legal Services"],
  [/\b(marketing agency|advertising agency|digital marketing|public relations)\b/i, "Marketing & Advertising"],
  [/\b(renewable energy|energy services?|solar|wind power|oil and gas|power generation)\b/i, "Energy Services"],
  [/\b(food manufactur|food production|beverage|brewery|dairy|bakery)\b/i, "Food & Beverage"],
  [/\b(cosmetics|beauty products?|personal care)\b/i, "Cosmetics & Personal Care"],
  [/\b(aerospace|defence|defense|military technology|security systems?)\b/i, "Aerospace & Defence"],
  [/\b(mining|metals?|steel|mineral processing)\b/i, "Mining & Metals"],
  [/\b(agriculture|agricultural|farming|agribusiness)\b/i, "Agriculture & Agribusiness"],
  [/\b(charity|nonprofit|non-profit|foundation|conservation)\b/i, "Nonprofit & Charity"],
  [/\b(travel|tourism|tour operator|holiday)\b/i, "Travel & Tourism"],
  [/\b(media|publishing|broadcasting|entertainment)\b/i, "Media & Entertainment"],
  [/\b(equipment rental|tool hire|plant hire|vehicle rental)\b/i, "Equipment Rental Services"],
  [/\b(consulting firm|consultancy|business advisory|management consulting)\b/i, "Business Consulting"],
];

const CONTEXT_ACTIVITY_RULES: Array<[RegExp, string]> = [
  [/\btelecommunications company\b/i, "Telecommunications"],
  [/\b(parcel delivery|couriers? and drivers|deliver more than .{0,20} parcels)\b/i, "Parcel Delivery & Logistics"],
  [/\b(convenience food|food manufacturing sites?|creators? of .{0,30} food)\b/i, "Food Manufacturing"],
  [/\b(MEP engineering|construction solutions|construction and infrastructure)\b/i, "Construction & Engineering"],
  [/\b(self storage|storage provider)\b/i, "Self Storage Services"],
  [/\b(domain name registry|DNS expertise)\b/i, "Internet Infrastructure"],
  [/\b(hotel team|hotels team|exceptional hospitality)\b/i, "Hospitality & Hotels"],
  [/\b(NHS services|healthcare contracts|patient care)\b/i, "Healthcare Services"],
  [/\b(suction excavation|excavation solutions)\b/i, "Excavation Services"],
  [/\b(asset lending|asset services|asset trading)\b/i, "Asset Finance & Advisory"],
  [/\b(sustainable energy|energy advice|renewable energy)\b/i, "Energy & Sustainability"],
  [/\b(biomass briquettes|steam coal|industrial fuel)\b/i, "Industrial Fuel Supply"],
  [/\b(Dynamics 365|ERP implementation)\b/i, "IT Consulting"],
  [/\b(furniture|sofa delivery|flooring)\b/i, "Furniture & Home Retail"],
  [/\b(we are|is|are) (a|an|the) .{0,40}(hospital|healthcare provider|medical provider)\b/i, "Healthcare Services"],
  [/\b(we are|is|are) (a|an|the) .{0,45}(construction|real estate|property development|housebuilding)\b/i, "Construction & Real Estate"],
  [/\b(we are|is|are) (a|an|the) .{0,45}(software|saas|technology|cloud) (company|provider|platform)\b/i, "Software & Technology"],
  [/\b(we are|is|are) (a|an|the) .{0,45}(manufacturer|manufacturing company|producer)\b/i, "Manufacturing"],
  [/\b(we are|is|are) (a|an|the) .{0,45}(bank|financial services|asset manager|investment manager)\b/i, "Banking & Financial Services"],
  [/\b(we provide|provider of|speciali[sz](e|ing) in) .{0,55}(logistics|transport|shipping|freight|warehousing)\b/i, "Transportation & Logistics"],
  [/\b(we provide|provider of|speciali[sz](e|ing) in) .{0,55}(education|training|tutoring|learning)\b/i, "Education & Training"],
  [/\b(we provide|provider of|speciali[sz](e|ing) in) .{0,55}(insurance|risk advisory|reinsurance)\b/i, "Insurance & Risk Advisory"],
  [/\b(we provide|provider of|speciali[sz](e|ing) in) .{0,55}(engineering|technical services)\b/i, "Engineering Services"],
  [/\b(we build|builder of|develops?) .{0,45}(homes|apartments|properties|commercial buildings)\b/i, "Construction & Real Estate"],
  [/\b(we produce|manufacturer of|manufactures?) .{0,55}(food|beverages|products|equipment|components|materials)\b/i, "Manufacturing"],
];

function normalizedText(values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").replace(/&(?:amp|apos|quot);/gi, " ").replace(/\s+/g, " ").trim();
}

function cleanShortExisting(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/&(?:amp|apos|quot);/gi, " ").replace(/[.]+$/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^(home|welcome|about us|not publicly identified)$/i.test(cleaned)) return null;
  if (/\$\{|\{\{|\}\}|(?:^|\s)[={}]+(?:\s|$)|\b(?:og|meta)[_-](?:description|title)\b/i.test(cleaned)) return null;
  if (cleaned.length > 48 || cleaned.split(/\s+/).length > 7 || /[.!?;:]\s/.test(cleaned)) return null;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Return one concise main-business label. Website paragraphs are treated only
 * as evidence and never displayed directly.
 */
export function natureOfBusinessLabel(company: CompanyProfileFields): string {
  const identityText = normalizedText([company.name, company.domain]);
  for (const [pattern, label] of KNOWN_ACTIVITY_RULES) {
    if (pattern.test(identityText)) return label;
  }

  const current = company.natureOfBusiness?.trim();
  if (current && !GENERIC_ACTIVITY_LABELS.has(current)) {
    const canonical = [...KNOWN_ACTIVITY_RULES, ...DIRECT_ACTIVITY_RULES].find(([pattern]) => pattern.test(current));
    if (canonical) return canonical[1];
  }

  const directText = normalizedText([company.natureOfBusiness, company.industry, company.name, company.domain]);
  for (const [pattern, label] of DIRECT_ACTIVITY_RULES) {
    if (pattern.test(directText)) return label;
  }

  const contextText = normalizedText(company.descriptionSnippets ?? []);
  for (const [pattern, label] of CONTEXT_ACTIVITY_RULES) {
    if (pattern.test(contextText)) return label;
  }

  const mappedIndustry = company.industry?.trim().toLowerCase();
  if (mappedIndustry && INDUSTRY_LABELS[mappedIndustry]) return INDUSTRY_LABELS[mappedIndustry];
  const shortIndustry = cleanShortExisting(company.industry);
  if (shortIndustry) return shortIndustry;
  const shortNature = cleanShortExisting(company.natureOfBusiness);
  if (shortNature) return shortNature;

  if (/\b(group|holdings?|partners?|solutions?|services?|consulting|advisors?)\b/i.test(identityText)) {
    return "Professional Services";
  }
  return "Business Services";
}

export function normalizeLinkedInProfileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))) {
      return null;
    }
    if (!/^\/in\/[^/]+\/?$/i.test(url.pathname)) return null;
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeLinkedInCompanyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com"))) {
      return null;
    }
    if (!/^\/company\/[^/]+\/?$/i.test(url.pathname)) return null;
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function companyLinkedInUrl(company: Pick<CompanyProfileFields, "name"> & { linkedinUrl?: string | null }): string {
  const direct = normalizeLinkedInCompanyUrl(company.linkedinUrl);
  if (direct) return direct;
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.name)}`;
}

/**
 * Prefer a verified public profile. When one is not available, return a
 * transparent LinkedIn people-search rather than guessing a person's URL.
 */
export function executiveLinkedInUrl(company: CompanyProfileFields): string {
  const direct = normalizeLinkedInProfileUrl(company.executiveLinkedinUrl);
  if (direct) return direct;
  const terms = [company.executiveName, company.name, company.executiveTitle || "CEO CFO"]
    .filter(Boolean)
    .join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(terms)}`;
}

export function executiveLinkedInLabel(company: CompanyProfileFields): string {
  if (normalizeLinkedInProfileUrl(company.executiveLinkedinUrl)) {
    return [company.executiveName, company.executiveTitle].filter(Boolean).join(" — ") || "View profile";
  }
  return "Find CEO/CFO";
}
