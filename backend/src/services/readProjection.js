// Aggregation bypasses Mongoose's select:false defaults. Public read pipelines
// must explicitly retain those exclusions along with their endpoint projection.
export function excludedReadFields(Model, selection = "") {
  const fields = Object.fromEntries(selection.split(" ").filter(Boolean).map(field => [field.replace(/^-/, ""), 0]));
  Model.schema.eachPath((name, path) => { if (path.options.select === false) fields[name] = 0; });
  return fields;
}
