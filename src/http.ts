import { requestUrl } from "obsidian";

export interface RequestOptions {
    url: string;
    method?: string;
    body?: string;
    contentType?: string;
    throw?: boolean;
    headers?: Record<string, string>;
}

export type Request = <T>(options: RequestOptions) => Promise<T>;

export async function promiseWrappedRequest<T>(options: RequestOptions): Promise<T> {
    const response = await requestUrl(options);

    if (response.status < 400) {
        return response.json as T;
    }

    throw new Error(`RequestError: ${response.status}: ${response.text}`);
}