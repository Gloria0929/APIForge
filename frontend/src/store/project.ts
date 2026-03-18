import { defineStore } from "pinia";
import axios from "axios";

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export const useProjectStore = defineStore("project", {
  state: () => ({
    projects: [] as Project[],
    currentProject: null as Project | null,
    loading: false,
  }),
  actions: {
    async fetchProjects() {
      this.loading = true;
      try {
        const response = await axios.get("/api/projects");
        if (Array.isArray(response.data)) {
          this.projects = response.data;
        } else {
          console.error(
            "Invalid /api/projects response (expected array):",
            response.data,
          );
          this.projects = [];
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        this.projects = [];
      } finally {
        this.loading = false;
      }
    },
    async fetchProject(id: string) {
      this.loading = true;
      try {
        const response = await axios.get(`/api/projects/${id}`);
        if (response.data && typeof response.data === "object") {
          this.currentProject = response.data;
        } else {
          console.error(
            "Invalid /api/projects/:id response (expected object):",
            response.data,
          );
          this.currentProject = null;
        }
      } catch (error) {
        console.error("Failed to fetch project:", error);
        this.currentProject = null;
      } finally {
        this.loading = false;
      }
    },
    async createProject(project: Partial<Project>) {
      this.loading = true;
      try {
        const response = await axios.post("/api/projects", project);
        this.projects.push(response.data);
        return response.data;
      } catch (error) {
        console.error("Failed to create project:", error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async updateProject(id: string, project: Partial<Project>) {
      this.loading = true;
      try {
        await axios.put(`/api/projects/${id}`, project);
        const index = this.projects.findIndex((p) => p.id === id);
        if (index !== -1) {
          this.projects[index] = { ...this.projects[index], ...project };
        }
        if (this.currentProject?.id === id) {
          this.currentProject = { ...this.currentProject, ...project };
        }
      } catch (error) {
        console.error("Failed to update project:", error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async deleteProject(id: string) {
      this.loading = true;
      try {
        await axios.delete(`/api/projects/${id}`);
        this.projects = this.projects.filter((p) => p.id !== id);
        if (this.currentProject?.id === id) {
          this.currentProject = null;
        }
      } catch (error) {
        console.error("Failed to delete project:", error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
