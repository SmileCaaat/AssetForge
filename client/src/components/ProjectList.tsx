import type { ProjectLink } from "../types";

interface ProjectListProps {
  projects: ProjectLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (project: ProjectLink) => void;
}

const stageLabels: Record<ProjectLink["stage"], string> = {
  concept: "概念",
  production: "生产中",
  done: "完成",
};

export function ProjectList({ projects, selectedId, onSelect, onDelete }: ProjectListProps) {
  if (projects.length === 0) {
    return <div className="empty-list">暂无项目</div>;
  }

  return (
    <ul className="project-list">
      {projects.map((project) => (
        <li key={project.id}>
          <button
            className={`project-item ${project.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(project.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onSelect(project.id);
              onDelete(project);
            }}
          >
            <span className="project-name">{project.displayName}</span>
            <span className="project-stage">{stageLabels[project.stage]}</span>
          </button>
          <button
            type="button"
            className="project-delete-btn"
            title="删除项目"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(project.id);
              onDelete(project);
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
