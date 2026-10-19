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

export function CloseTaskButton({ task, size = 'sm' }: { task: Task; size?: 'sm' | 'default' }) {
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: () => closeTask(task.id),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success('Task stopped.');
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={size === 'sm' ? 'h-9' : undefined}
          disabled={action.isPending}
        >
          Stop task
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop this task?</AlertDialogTitle>
          <AlertDialogDescription>
            Your agent can't buy anything more for it. Payments already on their way still finish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => action.mutate()}
          >
            Stop task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
