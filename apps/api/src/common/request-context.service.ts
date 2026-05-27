import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  userId?: string;
  path?: string;
  method?: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get() {
    return this.storage.getStore();
  }

  getRequestId() {
    return this.get()?.requestId;
  }

  setUserId(userId?: string) {
    const current = this.get();
    if (!current) {
      return;
    }
    current.userId = userId;
  }
}
