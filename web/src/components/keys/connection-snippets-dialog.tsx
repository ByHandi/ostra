import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serverConfigQuery } from "@/lib/api/storage";
import { S3_REGION, getS3Endpoint } from "@/lib/s3-endpoint";

export interface AvailableKey {
  id: string;
  name?: string;
}

interface ConnectionSnippetsDialogProps {
  keyId?: string;
  keyName?: string;
  secretAccessKey?: string;
  availableKeys?: AvailableKey[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function getInitialKeyId(keyId?: string, availableKeys?: AvailableKey[]): string {
  if (keyId) return keyId;
  return availableKeys?.[0]?.id ?? "";
}

function getActiveKeyName(
  keyName?: string,
  availableKeys?: AvailableKey[],
  activeKeyId?: string,
): string | undefined {
  if (keyName) return keyName;
  return availableKeys?.find((k) => k.id === activeKeyId)?.name;
}

function getEffectiveCredentials(
  activeKeyId: string,
  secretAccessKey?: string,
  customSecret?: string,
) {
  const effectiveKeyId = activeKeyId || "<YOUR_ACCESS_KEY_ID>";
  const effectiveSecret = secretAccessKey || customSecret || "<YOUR_SECRET_KEY>";
  return { effectiveKeyId, effectiveSecret };
}

function SnippetsTrigger({
  trigger,
  isControlled,
}: {
  trigger?: React.ReactNode;
  isControlled: boolean;
}) {
  if (trigger) {
    return <DialogTrigger asChild>{trigger}</DialogTrigger>;
  }
  if (isControlled) {
    return null;
  }
  return (
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" startContent={<Icon name="code" className="size-4" />}>
        Connection snippets
      </Button>
    </DialogTrigger>
  );
}

export function ConnectionSnippetsDialog({
  keyId,
  keyName,
  secretAccessKey,
  availableKeys,
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: ConnectionSnippetsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = isControlled ? (onOpenChangeProp ?? (() => {})) : setInternalOpen;

  const serverConfig = useQuery(serverConfigQuery());
  const detectedEndpoint = getS3Endpoint();
  const configuredEndpoint = serverConfig.data?.s3Endpoint || detectedEndpoint;
  const region = serverConfig.data?.s3Region || S3_REGION;

  const [customEndpoint, setCustomEndpoint] = useState<string | null>(null);
  const endpoint = customEndpoint ?? configuredEndpoint;

  const [selectedKeyId, setSelectedKeyId] = useState<string>(() =>
    getInitialKeyId(keyId, availableKeys),
  );
  const [customSecret, setCustomSecret] = useState(secretAccessKey ?? "");

  const activeKeyId = keyId ?? selectedKeyId;
  const activeKeyName = getActiveKeyName(keyName, availableKeys, activeKeyId);
  const { effectiveKeyId, effectiveSecret } = getEffectiveCredentials(
    activeKeyId,
    secretAccessKey,
    customSecret,
  );

  const tabProps = { endpoint, region, effectiveKeyId, effectiveSecret };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SnippetsTrigger trigger={trigger} isControlled={isControlled} />

      <DialogContent className="flex max-h-[88dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl">
        <div className="border-b px-5 py-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="code" className="size-5 text-primary" />
              Connection snippets
            </DialogTitle>
            <DialogDescription>
              Pre-configured snippets and configuration files to connect apps and tools to the S3
              API.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
          <KeyHeader
            keyId={keyId}
            keyName={activeKeyName}
            availableKeys={availableKeys}
            activeKeyId={activeKeyId}
            onSelectKeyId={setSelectedKeyId}
          />

          <EndpointStrip endpoint={endpoint} region={region} onEndpointChange={setCustomEndpoint} />

          <SecretNotice
            secretAccessKey={secretAccessKey}
            customSecret={customSecret}
            onCustomSecretChange={setCustomSecret}
          />

          <Tabs defaultValue="aws-cli" className="w-full">
            <div className="[scrollbar-width:none] overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              <TabsList className="min-w-max justify-start">
                <TabsTrigger value="aws-cli" className="gap-1.5">
                  <Icon name="terminal" className="size-3.5" />
                  AWS CLI
                </TabsTrigger>
                <TabsTrigger value="rclone" className="gap-1.5">
                  <Icon name="folder-sync" className="size-3.5" />
                  rclone
                </TabsTrigger>
                <TabsTrigger value="node" className="gap-1.5">
                  <Icon name="file-code" className="size-3.5" />
                  Node.js
                </TabsTrigger>
                <TabsTrigger value="python" className="gap-1.5">
                  <Icon name="file-text" className="size-3.5" />
                  Python
                </TabsTrigger>
                <TabsTrigger value="env" className="gap-1.5">
                  <Icon name="settings-2" className="size-3.5" />
                  .env / Shell
                </TabsTrigger>
              </TabsList>
            </div>

            <AwsCliTab {...tabProps} />
            <RcloneTab {...tabProps} />
            <NodeTab {...tabProps} />
            <PythonTab {...tabProps} />
            <EnvTab {...tabProps} />
          </Tabs>
        </div>

        <div className="flex items-center justify-end border-t px-5 py-3 sm:px-6">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface KeyHeaderProps {
  keyId?: string;
  keyName?: string;
  availableKeys?: AvailableKey[];
  activeKeyId: string;
  onSelectKeyId: (id: string) => void;
}

function KeyHeader({ keyId, keyName, availableKeys, activeKeyId, onSelectKeyId }: KeyHeaderProps) {
  if (availableKeys && availableKeys.length > 0 && !keyId) {
    return (
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-foreground">Select access key:</span>
        <Select value={activeKeyId || availableKeys[0].id} onValueChange={onSelectKeyId}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Choose an access key" />
          </SelectTrigger>
          <SelectContent>
            {availableKeys.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                <span>{k.name || "Unnamed"}</span>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">({k.id})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (keyId) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Access key:</span>
        <span className="font-mono font-medium text-foreground">
          {keyName ? `${keyName} (${keyId})` : keyId}
        </span>
      </div>
    );
  }

  return null;
}

interface EndpointStripProps {
  endpoint: string;
  region: string;
  onEndpointChange: (endpoint: string | null) => void;
}

function EndpointStrip({ endpoint, region, onEndpointChange }: EndpointStripProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3.5 text-xs sm:grid-cols-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground">S3 Endpoint</span>
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className="text-[11px] text-primary hover:underline"
          >
            {isEditing ? "Done" : "Override"}
          </button>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              className="h-7 font-mono text-xs"
              placeholder="https://s3.example.com"
            />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                onEndpointChange(null);
                setIsEditing(false);
              }}
            >
              Reset
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 font-mono font-medium">
            <span className="truncate">{endpoint}</span>
            <CopyButton value={endpoint} label="Copy endpoint" toastMessage="Endpoint copied" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <span className="block font-medium text-muted-foreground">Cluster Region</span>
        <div className="flex items-center gap-1 font-mono font-medium">
          <span>{region}</span>
          <CopyButton value={region} label="Copy region" toastMessage="Region copied" />
        </div>
      </div>
    </div>
  );
}

interface SecretNoticeProps {
  secretAccessKey?: string;
  customSecret: string;
  onCustomSecretChange: (secret: string) => void;
}

function SecretNotice({ secretAccessKey, customSecret, onCustomSecretChange }: SecretNoticeProps) {
  if (secretAccessKey) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-600 dark:text-emerald-400">
        <Icon name="check-circle" className="size-4 shrink-0" />
        <span>Using the secret access key generated in this session.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background/50 p-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Icon name="key-round" className="size-3.5 text-muted-foreground" />
        <span>Secret access key</span>
      </div>
      <p>
        Secret keys are only displayed when created. Paste your saved secret key below to populate
        the snippets, or replace{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
          &lt;YOUR_SECRET_KEY&gt;
        </code>{" "}
        manually.
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <Input
          type="password"
          placeholder="Paste secret key to populate snippets..."
          value={customSecret}
          onChange={(e) => onCustomSecretChange(e.target.value)}
          className="h-8 max-w-sm font-mono text-xs"
        />
        {customSecret && (
          <Button variant="ghost" size="sm" onClick={() => onCustomSecretChange("")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

interface TabProps {
  endpoint: string;
  region: string;
  effectiveKeyId: string;
  effectiveSecret: string;
}

function AwsCliTab({ endpoint, region, effectiveKeyId, effectiveSecret }: TabProps) {
  return (
    <TabsContent value="aws-cli" className="space-y-4 pt-2">
      <SnippetBlock
        title="Quick CLI setup"
        description="Run these commands in your terminal to configure the default AWS profile."
        language="bash"
        code={`aws configure set aws_access_key_id ${effectiveKeyId}
aws configure set aws_secret_access_key ${effectiveSecret}
aws configure set default.region ${region}
aws configure set default.s3.endpoint_url ${endpoint}`}
      />

      <SnippetBlock
        title="Test connection"
        description="Verify access by listing buckets through the S3 API."
        language="bash"
        code={`aws --endpoint-url ${endpoint} s3 ls`}
      />

      <div className="space-y-3 pt-2">
        <p className="text-xs font-semibold text-foreground">Alternative: Manual config files</p>
        <SnippetBlock
          title="~/.aws/credentials"
          language="ini"
          code={`[default]
aws_access_key_id = ${effectiveKeyId}
aws_secret_access_key = ${effectiveSecret}`}
        />
        <SnippetBlock
          title="~/.aws/config"
          language="ini"
          code={`[default]
region = ${region}
endpoint_url = ${endpoint}
s3 =
    addressing_style = path`}
        />
      </div>
    </TabsContent>
  );
}

function RcloneTab({ endpoint, region, effectiveKeyId, effectiveSecret }: TabProps) {
  return (
    <TabsContent value="rclone" className="space-y-4 pt-2">
      <SnippetBlock
        title="rclone config block"
        description="Append this block to ~/.config/rclone/rclone.conf (or %APPDATA%/rclone/rclone.conf on Windows)."
        language="ini"
        code={`[ostra]
type = s3
provider = Other
access_key_id = ${effectiveKeyId}
secret_access_key = ${effectiveSecret}
endpoint = ${endpoint}
region = ${region}
force_path_style = true
acl = private`}
      />

      <SnippetBlock
        title="Test connection"
        description="List buckets configured under the remote."
        language="bash"
        code="rclone lsd ostra:"
      />
    </TabsContent>
  );
}

function NodeTab({ endpoint, region, effectiveKeyId, effectiveSecret }: TabProps) {
  return (
    <TabsContent value="node" className="space-y-4 pt-2">
      <SnippetBlock
        title="Install AWS SDK v3"
        language="bash"
        code="npm install @aws-sdk/client-s3"
      />

      <SnippetBlock
        title="Initialize S3 client"
        description="Example using AWS SDK for JavaScript v3 (ESM / TypeScript)."
        language="typescript"
        code={`import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "${endpoint}",
  region: "${region}",
  credentials: {
    accessKeyId: "${effectiveKeyId}",
    secretAccessKey: "${effectiveSecret}",
  },
  forcePathStyle: true,
});

// Test connection by listing buckets
const { Buckets } = await s3.send(new ListBucketsCommand({}));
console.log("Buckets:", Buckets?.map((b) => b.Name));`}
      />
    </TabsContent>
  );
}

function PythonTab({ endpoint, region, effectiveKeyId, effectiveSecret }: TabProps) {
  return (
    <TabsContent value="python" className="space-y-4 pt-2">
      <SnippetBlock title="Install boto3" language="bash" code="pip install boto3" />

      <SnippetBlock
        title="Initialize boto3 client"
        description="Example using boto3 with path-style addressing."
        language="python"
        code={`import boto3
from botocore.client import Config

s3 = boto3.client(
    "s3",
    endpoint_url="${endpoint}",
    region_name="${region}",
    aws_access_key_id="${effectiveKeyId}",
    aws_secret_access_key="${effectiveSecret}",
    config=Config(s3={"addressing_style": "path"}),
)

# Test connection by listing buckets
response = s3.list_buckets()
print("Buckets:", [b["Name"] for b in response.get("Buckets", [])])`}
      />
    </TabsContent>
  );
}

function EnvTab({ endpoint, region, effectiveKeyId, effectiveSecret }: TabProps) {
  return (
    <TabsContent value="env" className="space-y-4 pt-2">
      <SnippetBlock
        title="Environment file (.env)"
        description="Standard environment variables supported by modern S3 SDKs and tooling."
        language="env"
        code={`AWS_ACCESS_KEY_ID=${effectiveKeyId}
AWS_SECRET_ACCESS_KEY=${effectiveSecret}
AWS_ENDPOINT_URL_S3=${endpoint}
AWS_DEFAULT_REGION=${region}`}
      />

      <SnippetBlock
        title="Shell export commands"
        description="Set environment variables in your current shell session."
        language="bash"
        code={`export AWS_ACCESS_KEY_ID="${effectiveKeyId}"
export AWS_SECRET_ACCESS_KEY="${effectiveSecret}"
export AWS_ENDPOINT_URL_S3="${endpoint}"
export AWS_DEFAULT_REGION="${region}"`}
      />
    </TabsContent>
  );
}

interface SnippetBlockProps {
  title: string;
  description?: string;
  code: string;
  language?: string;
}

function SnippetBlock({ title, description, code, language }: SnippetBlockProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {language && (
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {language}
          </span>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="group relative rounded-lg border bg-muted/50 transition-colors">
        <div className="absolute top-2 right-2 z-10">
          <CopyButton
            value={code}
            label={`Copy ${title}`}
            toastMessage={`${title} copied to clipboard`}
          />
        </div>
        <pre className="overflow-x-auto p-3.5 pr-10 font-mono text-xs leading-relaxed text-foreground/90">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
