import "dotenv/config";

import {
  HousecallProApiError,
  HousecallProClient,
  loadHousecallProConfig,
} from "./housecallProClient.js";

function printJson(label: string, value: unknown) {
  process.stdout.write(`${label}\n${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const config = loadHousecallProConfig();
  const client = new HousecallProClient(config);

  process.stdout.write("Housecall Pro smoke test starting...\n");
  process.stdout.write(`Base URL: ${config.baseUrl}\n`);
  process.stdout.write(`Customers path: ${config.customersPath}\n`);
  process.stdout.write(`Jobs path: ${config.jobsPath}\n`);
  process.stdout.write(`Leads path: ${config.leadsPath}\n`);

  const customers = await client.listCustomers({ page: 1, page_size: 1 });
  printJson("Customer list response:", customers);

  const jobs = await client.listJobs({ page: 1, page_size: 1 });
  printJson("Job list response:", jobs);
}

main().catch((error) => {
  if (error instanceof HousecallProApiError) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exit(2);
  }

  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
