import type { Task } from '@semanticauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { closeTask } from '@/api/tasks';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
export function CloseTaskButton({ task }: { task: Task }) {
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: () => closeTask(task.id),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success('Task closed.');
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={action.isPending}>
          Stop task
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop this task?</AlertDialogTitle>
          <AlertDialogDescription>
            This closes the active task and prevents new requests under it. Already-issued payments
            may still complete. Completed payments are not reversed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep active</AlertDialogCancel>
          <AlertDialogAction disabled={action.isPending} onClick={() => action.mutate()}>
            Stop task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
