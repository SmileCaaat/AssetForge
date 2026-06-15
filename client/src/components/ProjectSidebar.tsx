import type { ProjectLink } from "../types";
import { ProjectList } from "./ProjectList";

interface ProjectSidebarProps {
  collapsed: boolean;
  projects: ProjectLink[];
  selectedId: string | null;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onDelete: (project: ProjectLink) => void;
  onNewProject: () => void;
}

export function ProjectSidebar({
  collapsed,
  projects,
  selectedId,
  onToggle,
  onSelect,
  onDelete,
  onNewProject,
}: ProjectSidebarProps) {
  if (collapsed) {
    return (
      <aside className="sidebar is-collapsed">
        <button
          type="button"
          className="sidebar-rail-btn"
          onClick={onToggle}
          title="展开项目列表"
        >
          <span className="rail-icon">▶</span>
          <span className="rail-label">项目</span>
          {projects.length > 0 && <span className="rail-count">{projects.length}</span>}
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>项目</h2>
        <div className="sidebar-header-actions">
          <button type="button" className="btn-primary btn-sm" onClick={onNewProject} title="新建项目">
            +
          </button>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggle}
            title="收起项目列表"
          >
            ◀
          </button>
        </div>
      </div>
      <ProjectList
        projects={projects}
        selectedId={selectedId}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    </aside>
  );
}
