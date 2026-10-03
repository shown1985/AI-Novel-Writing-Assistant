import { useRef, useEffect } from "react";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import {
  isCurrentBookRequest,
  nextBookRequestScope,
  type BookRequestScope,
} from "./workspaceSessionPolicy";

/** A result belongs to the mounted book lifetime, including A → B → A navigation. */
export function useBookScopedMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
 novelId: string,
 options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
 const identity = useRef<BookRequestScope>(nextBookRequestScope(null, novelId));
 identity.current = nextBookRequestScope(identity.current, novelId);
 const scope = identity.current;
 useEffect(() => { scope.mounted = true; return () => { scope.mounted = false; }; }, [scope]);
 return useMutation({
  ...options,
  onMutate: async (variables, context) => ({ scope, value: await options.onMutate?.(variables, context) }),
  onSuccess: (data, variables, context, mutationContext) => {
   if (!context || !isCurrentBookRequest(context.scope, identity.current)) return;
   return options.onSuccess?.(data, variables, context.value as TContext, mutationContext);
  },
  onError: (error, variables, context, mutationContext) => {
   if (!context || !isCurrentBookRequest(context.scope, identity.current)) return;
   return options.onError?.(error, variables, context.value, mutationContext);
  },
  onSettled: (data, error, variables, context, mutationContext) => {
   if (!context || !isCurrentBookRequest(context.scope, identity.current)) return;
   return options.onSettled?.(data, error, variables, context.value, mutationContext);
  },
 });
}
