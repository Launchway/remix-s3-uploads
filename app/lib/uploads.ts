export const getBucketPathPrefix = (userId: string) =>
  `user/${userId}/uploads/`;

export const generateFileKey = (userId: string) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  return `${getBucketPathPrefix(userId)}${timestamp}-${randomString}`;
};
