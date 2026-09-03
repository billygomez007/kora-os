const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface KoraEnvironment extends Record<string, unknown> {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
}

export function validateEnvironment(
  input: Record<string, unknown>,
): KoraEnvironment {
  const nodeEnvironment = String(input.NODE_ENV ?? 'development');
  if (!NODE_ENVIRONMENTS.includes(nodeEnvironment as NodeEnvironment)) {
    throw new Error(
      `NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`,
    );
  }

  const port = Number(input.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const apiPrefix = String(input.API_PREFIX ?? 'v1')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!apiPrefix || !/^[a-z0-9][a-z0-9/-]*$/i.test(apiPrefix)) {
    throw new Error('API_PREFIX contains unsupported characters');
  }

  return {
    ...input,
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    PORT: port,
    API_PREFIX: `/${apiPrefix}`,
  };
}
