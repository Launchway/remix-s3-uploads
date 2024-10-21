export const DummyFileGenerator = () => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Generate dummy file</h2>
      <p className="mb-3">Generate a sample text file to use in this demo:</p>
      <a
        href="/generate-dummy"
        className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-300 w-full text-center"
      >
        Generate dummy .txt file
      </a>
      <p className="mt-2 text-sm text-gray-600">
        (A new file with a random name will be generated each time)
      </p>
    </div>
  );
};
