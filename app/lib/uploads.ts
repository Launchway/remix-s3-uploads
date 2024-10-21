import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadedFile } from "~/types";

export const getBucketPathPrefix = (userId: string) =>
  `user/${userId}/uploads/`;

export const generateFileKey = (userId: string) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  return `${getBucketPathPrefix(userId)}${timestamp}-${randomString}`;
};

export function createS3Client(
  client: "s3" | "cloudflare" | "hetzner"
): S3Client {
  if (client === "cloudflare") {
    return new S3Client({
      region: "auto",
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_ACCESS_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }
  if (client === "s3") {
    return new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  if (client === "hetzner") {
    return new S3Client({
      endpoint: process.env.HETZNER_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.HETZNER_ACCESS_KEY!,
        secretAccessKey: process.env.HETZNER_SECRET_KEY!,
      },
    });
  }
  throw new Error("unknown provider");
}

export const generatePresignedUrlsForExistingUploads = ({
  s3Client,
  bucketName,
  uploadedFiles,
}: {
  s3Client: S3Client;
  bucketName: string;
  uploadedFiles: UploadedFile[];
}) => {
  return Promise.all(
    uploadedFiles.map(
      async (file: {
        key: string;
        uploadedAt: string;
        originalFileName: string;
      }) => {
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.key,
        });
        const presignedUrl = await getSignedUrl(s3Client, getCommand, {
          expiresIn: 3600,
        });
        return { ...file, presignedUrl };
      }
    )
  );
};
