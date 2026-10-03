function prepareBuilderArgs(requestedArgs, localBuild) {
  const args = [...requestedArgs];
  if (!localBuild) {
    return args;
  }

  const publishValues = readPublishValues(args);
  if (publishValues.length > 1 || publishValues.some((value) => value !== "never")) {
    throw new Error("Local desktop builds cannot publish artifacts.");
  }
  if (publishValues.length === 0) {
    args.push("--publish", "never");
  }
  return args;
}

function readPublishValues(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--publish" || arg === "-p") {
      values.push(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--publish=") || arg.startsWith("-p=")) {
      values.push(arg.slice(arg.indexOf("=") + 1));
    }
  }
  return values;
}

function isPublishRequested(args) {
  return readPublishValues(args).some((value) => value !== "never");
}

module.exports = { prepareBuilderArgs, isPublishRequested };
