import {
  create,
  type StoreOptions
} from '../../../packages/coaction-react/shared';

export const createSharedCounter = (
  transport: NonNullable<StoreOptions<any>['transport']>
) =>
  create(
    (set) => ({
      count: 0,
      increment() {
        set(() => {
          this.count += 1;
        });
      }
    }),
    { transport }
  );
