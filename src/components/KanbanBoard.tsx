import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface KanbanLead {
  id: string;
  client: string;
  title: string;
  stage: string;
  offeredRate: number | null;
  matchScore: number | null;
}

interface KanbanBoardProps {
  leads: KanbanLead[];
  onStageChange: (leadId: string, newStage: string) => void;
}

const columnDefs = [
  { id: "lead", color: "bg-gray-500" },
  { id: "qualified", color: "bg-blue-500" },
  { id: "negotiating", color: "bg-yellow-500" },
  { id: "won", color: "bg-green-500" },
  { id: "lost", color: "bg-red-500" },
] as const;

export default function KanbanBoard({ leads, onStageChange }: KanbanBoardProps) {
  const { t } = useTranslation();
  const columns = columnDefs.map((col) => ({ ...col, label: t(`stages.${col.id}`) }));
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStage = result.destination.droppableId;
    const leadId = result.draggableId;
    if (newStage !== result.source.droppableId) {
      onStageChange(leadId, newStage);
    }
  };

  const leadsByStage = (stage: string) => leads.filter((l) => l.stage === stage);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colLeads = leadsByStage(col.id);
          return (
            <Droppable key={col.id} droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`w-56 flex-shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 ${
                    snapshot.isDraggingOver ? "ring-2 ring-blue-400" : ""
                  }`}
                >
                  <div className={`${col.color} text-white text-sm font-semibold px-3 py-2 rounded-t-lg flex justify-between`}>
                    <span>{col.label}</span>
                    <span className="bg-white/20 rounded-full px-2 text-xs leading-5">{colLeads.length}</span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {colLeads.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${snapshot.isDragging ? "shadow-lg ring-2 ring-blue-400" : ""}`}
                          >
                            <Link
                              to={`/leads/${lead.id}`}
                              className="block p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow text-sm"
                              onClick={(e) => {
                                if (snapshot.isDragging) e.preventDefault();
                              }}
                            >
                              <p className="font-medium truncate">{lead.title}</p>
                              <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{lead.client}</p>
                              <div className="flex items-center gap-2 mt-2">
                                {lead.matchScore !== null && (
                                  <span
                                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                      lead.matchScore >= 70
                                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                        : lead.matchScore >= 40
                                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                                          : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                    }`}
                                  >
                                    {lead.matchScore}%
                                  </span>
                                )}
                                {lead.offeredRate && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {lead.offeredRate}€/d
                                  </span>
                                )}
                              </div>
                            </Link>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
