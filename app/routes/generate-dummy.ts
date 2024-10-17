import { LoaderFunction } from "@remix-run/node";
import { faker } from "@faker-js/faker";

export const loader: LoaderFunction = async () => {
  // Generate dummy content using Faker.js
  const { content, fileName } = generateDummyContent();

  // Set the appropriate headers for a text file download
  const headers = new Headers();
  headers.set("Content-Type", "text/plain");
  headers.set("Content-Disposition", `attachment; filename="${fileName}"`);

  // Return the response with the generated content
  return new Response(content, { headers });
};

function generateDummyContent(): { content: string; fileName: string } {
  const paragraphs = faker.lorem.paragraphs(3);
  const name = faker.person.fullName();
  const email = faker.internet.email();
  const date = faker.date.recent().toISOString();
  const fileSize = Buffer.byteLength(paragraphs, "utf8");

  // Generate a random file name with a random ID prefix
  const randomId = faker.string.alphanumeric(8);
  const fileName = `${randomId}-${faker.word.adjective()}-${faker.word.noun()}.txt`;

  const content = `
Generated Dummy Content

${paragraphs}

Author: ${name}
Email: ${email}
Date: ${date}

File Size: ${fileSize} bytes
File Name: ${fileName}
  `.trim();

  return { content, fileName };
}
