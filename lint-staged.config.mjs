// Pre-commit checks for files outside web/ (web/package.json has its own lint-staged
// config; lint-staged uses the closest config for each staged file).
//
// Go: format, vet, and the same complexity limits as the frontends' ESLint rules
// (cyclomatic 12, cognitive 15). Shell: the shellcheck version CI uses.

const GOCYCLO = "github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0";
const GOCOGNIT = "github.com/uudashr/gocognit/cmd/gocognit@v1.3.0";
const IGNORE = "_test|internal/store/"; // tests and sqlc-generated code

const quote = (files) => files.map((f) => JSON.stringify(f)).join(" ");
const inControl = (cmd) => `sh -c "cd control && ${cmd}"`;

export default {
  "control/**/*.go": (files) => [
    `gofmt -w ${quote(files)}`,
    inControl("go vet ./..."),
    inControl(`go run ${GOCYCLO} -over 12 -ignore '${IGNORE}' .`),
    inControl(`go run ${GOCOGNIT} -over 15 -ignore '${IGNORE}' .`),
  ],
  "scripts/*.sh": (files) =>
    `docker run --rm -v "${process.cwd()}:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 ${files
      .map((f) => JSON.stringify(f.replace(`${process.cwd()}/`, "")))
      .join(" ")}`,
};
