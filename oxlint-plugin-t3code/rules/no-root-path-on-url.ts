import { defineRule, type ESTree } from "@oxlint/plugins";

const MESSAGE =
  "An environment may sit behind a gateway prefix (/e/<name>), and a root path drops it. For an environment's URL use environmentEndpointUrl, or keep gatewayPrefixOf(url) in the path. For a URL that is not an environment's, disable this line and say whose it is.";

function isRootPathLiteral(node: ESTree.Node): boolean {
  if (node.type === "Literal") return typeof node.value === "string" && node.value.startsWith("/");
  if (node.type !== "TemplateLiteral" || node.expressions.length > 0) return false;
  return node.quasis[0]?.value.cooked?.startsWith("/") ?? false;
}

function isPathnameMember(node: ESTree.Node): boolean {
  if (node.type !== "MemberExpression") return false;
  const { property } = node;
  if (!node.computed && property.type === "Identifier") return property.name === "pathname";
  return property.type === "Literal" && property.value === "pathname";
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow giving a URL a root-relative path in client code; an environment URL must keep its gateway prefix.",
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        if (node.operator !== "=" || !isPathnameMember(node.left)) return;
        if (!isRootPathLiteral(node.right)) return;
        context.report({ node: node.right, message: MESSAGE });
      },
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "URL") return;
        const [path, base] = node.arguments;
        if (path === undefined || base === undefined || path.type === "SpreadElement") return;
        if (!isRootPathLiteral(path)) return;
        context.report({ node: path, message: MESSAGE });
      },
    };
  },
});
